// This example uses Express to receive webhooks
const express = require('express')
const axios = require('axios');
//const sendToServiceNow = require("../utils/sendToServiceNow")
const app = express()
require('dotenv').config();

// Instantiating formsg-sdk without parameters default to using the package's
// production public signing key.
const formsg = require('@opengovsg/formsg-sdk')({ mode: 'staging' })

// This is where your domain is hosted, and should match
// the URI supplied to FormSG in the form dashboard
const POST_URI = 'https://formsg-servicenow-webhook.onrender.com/formsg/webhook'

// Your form's secret key downloaded from FormSG upon form creation
const formSecretKey = process.env.FORM_SECRET_KEY

// Set to true if you need to download and decrypt attachments from submissions
const HAS_ATTACHMENTS = false

function yesNoToBoolean(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'yes') return true;
    if (v === 'no') return false;
  }

  return null;
}

function formatDateForServiceNow(dateStr) {
  if (!dateStr) return null;

  // Expected FormSG format: "03 Dec 2025"
  const parsed = new Date(dateStr);

  if (isNaN(parsed.getTime())) return null;

  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}



function findField(submission, keyword) {
  const answers = submission?.responses;

  if (!Array.isArray(answers)) return null;

  //const item = answers.find(a =>
    //typeof a?.question === 'string' &&
    //a.question.toLowerCase().includes(keyword.toLowerCase())
  //);
  const item = answers.find(a => a.question === keyword);

  if (!item) return null;

  // Handle based on field type
  if (item.answer !== undefined) {
    return item.answer; // text, email, number, etc.
  }

  if (Array.isArray(item.answerArray)) {
    return item.answerArray.join(', '); // checkbox, multi-select
  }

  return null;
}

function findAddress(submission, exactQuestion) {
  const answers = submission?.responses;
  if (!Array.isArray(answers)) return null;

  const item = answers.find(a => a.question === exactQuestion);
  if (!item || !Array.isArray(item.answerArray)) return null;

  const [
    blockNumber,
    streetName,
    buildingName,
    levelNumber,
    unitNumber,
    postalCode
  ] = item.answerArray;

  return {
    blockNumber: blockNumber || null,
    streetName: streetName || null,
    buildingName: buildingName || null,
    levelNumber: levelNumber || null,
    unitNumber: unitNumber || null,
    postalCode: postalCode || null
  };
}

function findEmploymentHistory(submission, exactQuestion) {
  const answers = submission?.responses;
  if (!Array.isArray(answers)) return [];

  const item = answers.find(a => a.question === exactQuestion);
  if (!item || !Array.isArray(item.answerArray)) return [];

  // Normalize to array of rows
  const rows = Array.isArray(item.answerArray[0])
    ? item.answerArray
    : [item.answerArray];

  return rows
    .filter(row => Array.isArray(row) && row.some(v => v)) // remove empty rows
    .map(row => {
      const [
        companyName,
        jobPosition,
        employmentPeriod,
        salary
      ] = row;

      return {
        companyName: companyName || null,
        jobPosition: jobPosition || null,
        employmentPeriod: employmentPeriod || null,
        salary: salary || null
      };
    });
}


function formatUnit(level, unit) {
  if (!level && !unit) return null;
  if (level && unit) return `#${level}-${unit}`;
  if (level) return `#${level}`;
  if (unit) return `#${unit}`;
  return null;
}

function extractJobChoices(submission) {
  const answers = submission?.responses;
  if (!Array.isArray(answers)) return [];

  const jobChoices = {};

  for (const a of answers) {
    if (!a.question) continue;

    // Match "Job Choice X:"
    const match = a.question.match(/^Job Choice (\d+):\s*(.+)$/);
    if (!match) continue;

    const choiceNo = match[1]; // "1", "2"
    const field = match[2];    // "Position Requested", etc.

    if (!jobChoices[choiceNo]) {
      jobChoices[choiceNo] = { choice: Number(choiceNo) };
    }

    if (field.includes("Position Requested")) {
      jobChoices[choiceNo].position = a.answer || null;
    }

    if (field.includes("Expected Salary")) {
      jobChoices[choiceNo].expectedSalary = a.answer || null;
    }

    if (field.includes("Requested Work Region")) {
      jobChoices[choiceNo].workRegion = Array.isArray(a.answerArray)
        ? a.answerArray.join(", ")
        : null;
    }
  }

  return Object.values(jobChoices);
}





/////

async function getCaseByInmateNo(inmateNo) {
  const url =
    `${process.env.SERVICENOW_INSTANCE}` +
    `/api/now/table/${process.env.SERVICENOW_TABLE}` +
    `?sysparm_query=u_inmate_no=${encodeURIComponent(inmateNo)}` +
    `&sysparm_limit=1`;

  const auth = Buffer.from(
    `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
  ).toString("base64");

  const res = await axios.get(url, {
    headers: {
      Authorization: `Basic ${auth}`
    }
  });

  return res.data.result?.[0] || null;
}


// 3) Send to ServiceNow

async function upsertParentCase(data) {
  const auth = Buffer.from(
    `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
  ).toString("base64");

  const payload = {
    u_inmate_no: data.inmate_no,
    u_application_type: data.type_of_application,
    u_employment_assistance_type: data.employment_assistance,
    u_cbp_schemes_emplace: data.programme_status,
    u_ed0: data.dor,
    u_cbp_emplacement_date: data.programme_emplacement_date,
    u_attended_jp_session: data.jp_attend,
    u_jp_session_location: data.where_jp_attend,
    u_assisted_by_staff: data.assisted_by_yrsg,
    u_staff_name_contact_number: data.name_yrsg,
    u_offence_desc: data.current_last_offence,
    u_ro_name_contact_number: data.ro_name,
    u_full_name: data.full_name,
    u_nric_fin: data.nric,
    u_citizenship: data.nationality,
    u_gender: data.sex,
    u_race: data.race,
    u_dob: data.dob,
    u_mrital_status: data.marital_status,
    u_ns_liability: data.national_service,
    u_contact_no: data.contact_number,
    u_email: data.email,
    u_nok_name: data.NOK_name,
    u_next_of_kin_name_contact_no: data.NOK_contact_number,
    u_blk_hse_no: data.address_block,
    u_street_name: data.address_street,
    u_unit_no: formatUnit(data.address_level, data.address_unit),
    u_postal_code: data.address_postal,
    u_building_name: data.address_building,
    u_visible_tattoo: data.visible_tattoo,
    u_tattoo_details: data.tatto_details,
    u_highest_edu_qualification: data.hel,
    u_highest_edu_qualification_specialisation: data.she,
    u_spoken_language: data.spoken,
    u_written_language: data.written,
    u_driving_vocational_license_certification: data.dlc,
    u_work_hours_preference: data.whp,
    u_religious_preference: data.religious_preference
  };

  const existing = await getCaseByInmateNo(data.inmate_no);

  if (existing) {
    // 🔄 UPDATE
    const updateUrl =
      `${process.env.SERVICENOW_INSTANCE}` +
      `/api/now/table/${process.env.SERVICENOW_TABLE}/${existing.sys_id}`;

    const res = await axios.patch(updateUrl, payload, {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      }
    });

    return { sys_id: existing.sys_id, action: "updated", result: res.data };
  }

  // 🆕 CREATE
  const createUrl =
    `${process.env.SERVICENOW_INSTANCE}` +
    `/api/now/table/${process.env.SERVICENOW_TABLE}`;

  const res = await axios.post(createUrl, payload, {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json"
    }
  });

  return { sys_id: res.data.result.sys_id, action: "created", result: res.data };
}
//////////////////////////
async function deleteChildRecords(table, parentSysId) {
  const url =
    `${process.env.SERVICENOW_INSTANCE}` +
    `/api/now/table/${table}?sysparm_query=u_inmate_no=${parentSysId}`;

  const auth = Buffer.from(
    `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
  ).toString("base64");

  await axios.delete(url, {
    headers: { Authorization: `Basic ${auth}` }
  });
}
//////////////////////////////

async function jobsendToServiceNow(data) {
  const url = `${process.env.SERVICENOW_INSTANCE}/api/now/table/u_cms_job_exp`;

  const auth = Buffer.from(
    `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
  ).toString('base64');

  const jobpayload = {
    u_inmate_no: data.parent_sys_id, // reference field
    u_company_name: data.company_name,
    u_occupation: data.job_position,
    u_period: data.employment_period,
    u_past_salary_earned: data.last_drawn_salary
  };

  const jobresponse = await axios.post(url, jobpayload, {
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json"
    }
  });

  return jobresponse.data;
};

////////////

async function sendJobChoicesToServiceNow(jobChoices, parentSysId) {
  const url = `${process.env.SERVICENOW_INSTANCE}/api/now/table/u_cms_job_preference`;

  const auth = Buffer.from(
    `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
  ).toString("base64");

  for (const job of jobChoices) {
    await axios.post(
      url,
      {
        u_inmate_no: parentSysId,   // reference field
        u_job_prefernce_id: job.choice,
        u_position_requested: job.position,
        u_expected_salary: job.expectedSalary,
        u_requested_work_region: job.workRegion
      },
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json"
        }
      }
    );
  }
}
//////////////////


app.get('/', (req, res) => {
    res.status(200).send('Hello, this is the FormSG webhook receiver!')
});

app.post('/formsg/webhook',
    // Endpoint authentication by verifying signatures
    function (req, res, next) {
        try {
            formsg.webhooks.authenticate(req.get('X-FormSG-Signature'), POST_URI)
            // Continue processing the POST body
            return next()
        } catch (e) {
            return res.status(401).send({ message: 'Unauthorized' })
        }
    },
    // Parse JSON from raw request body
    express.json(),
    // Decrypt the submission
    async function (req, res, next) {
        // If `verifiedContent` is provided in `req.body.data`, the return object
        // will include a verified key.
        const submission = HAS_ATTACHMENTS
            ? await formsg.crypto.decryptWithAttachments(formSecretKey, req.body.data)
            : formsg.crypto.decrypt(formSecretKey, req.body.data)

        // If the decryption failed, submission will be `null`.
        if (submission) {
            // Continue processing the submission
            console.log(submission);
          const address = findAddress(submission, "Local address");
          const employmentList = findEmploymentHistory(submission,"Job History (Company Name, Job Position, Period of Employment MM/YY to MM/YY (e.g. 10/20 to 08/22), Salary)");

          const jobChoices = extractJobChoices(submission);

          console.log("📦 Job Choices:", jobChoices);

  
      const jpattend = findField(submission,"Have you attended any Job Preparation (JP) session by YRSG for your current incarceration?");
      const assisted_by = findField(submission,"Are you being assisted by any staff from Yellow Ribbon Singapore (YRSG) or Selarang Halfway House?");
      const tattooAnswer = findField(submission,"Do you have any visible tattoo?");
      const releasedate = findField(submission,"Date of Release (EDR)");
      const emplacementdate = findField(submission,"Programme Emplacement Date");
      const dobRaw = findField(submission,"Date of Birth");
          
    const mapped = {
    demo: findField(submission,"Demo"),
    type_of_application: findField(submission,"Type of Application"),
    employment_assistance: findField(submission,"Type of Employment Assistance required"),
    programme_details: findField(submission,"Programme Details"),
    programme_status: findField(submission,"Programme Status"),
    inmate_no: findField(submission,"Inmate No."),
    dor: formatDateForServiceNow(releasedate),
    programme_emplacement_date: formatDateForServiceNow(emplacementdate),
    jp_attend: yesNoToBoolean(jpattend),
    where_jp_attend: findField(submission,"Where did you attend the Job Preparation (JP) session?"),
    assisted_by_yrsg: yesNoToBoolean(assisted_by),
    name_yrsg: findField(submission,"Name and Contact Number of Yellow Ribbon Singapore (YRSG) or Selarang Halfway House staff who is assisting you"),
    current_last_offence: findField(submission,"Current or Last Offence"),
    ro_name: findField(submission,"Reintegration Officer (RO)'s Name and Contact Number"),
    personal_information: findField(submission,"Personal Information"),
    full_name: findField(submission,"Name"),
    nric: findField(submission,"NRIC"),
    nationality: findField(submission,"Nationality"),
    sex: findField(submission,"Sex"),
    race: findField(submission,"Race"),
    dob: formatDateForServiceNow(dobRaw),
    marital_status: findField(submission,"Marital Status"),
    national_service: findField(submission,"National Service"),
    contact_number: findField(submission,"Contact Number"),
    email: findField(submission,"Email"),
    NOK_name: findField(submission,"Next-of-Kin's Name"),
    NOK_contact_number: findField(submission,"Next-of-Kin's Contact Number"),
    //local_address: findField(submission,"Local address"),
  address_block: address?.blockNumber,
  address_street: address?.streetName,
  address_building: address?.buildingName,
  address_level: address?.levelNumber,
  address_unit: address?.unitNumber,
  address_postal: address?.postalCode,
    visible_tattoo: yesNoToBoolean(tattooAnswer),
    tatto_details: findField(submission,"Tattoo Details"),
    els: findField(submission,"Education / Language Proficiency / Skills"),
    hel: findField(submission,"Highest Educational Level"),
    she: findField(submission,"Specialisation/Field of Highest Education"),
    spoken: findField(submission,"Spoken (Language)"),
    written: findField(submission,"Written (Language)"),
    dlc: findField(submission,"Driving/Vocational Licence/Certification"),
    //employment_history: findField(submission,"Employment History"),
    //cjp: findField(submission,"Job History (Company Name, Job Position, Period of Employment MM/YY to MM/YY (e.g. 10/20 to 08/22), Salary)"),
    jps1: findField(submission,"Job Choice 1: Position Requested"),
    jes1: findField(submission,"Job Choice 1: Expected Salary"),
    jrwr1: findField(submission,"Job Choice 1: Requested Work Region"),
    jps2: findField(submission,"Job Choice 2: Position Requested"),
    jes2: findField(submission,"Job Choice 2: Expected Salary"),
    jrwr2: findField(submission,"Job Choice 2: Requested Work Region"),
    whp: findField(submission,"Work hours preference"),
    religious_preference: findField(submission,"For Clients with Religious Preferences: F&B/Grocery/Food Delivery Jobs"),
  };

        console.log("📦 Mapped payload:", mapped);
        //console.log("📦 Mapped payload:", jobmapped);
    try {
      const parent = await upsertParentCase(mapped);
      const parentSysId = parent.sys_id;

      console.log(`✔ Parent record ${parent.action}:`, parentSysId);

    //const result = await sendToServiceNow(mapped);
      //const parentSysId = result.result.sys_id;
      //const jobresult = await jobsendToServiceNow({
  //...jobmapped,
 // parent_sys_id: parentSysId
//});
await deleteChildRecords("u_cms_job_exp", parentSysId);
await deleteChildRecords("u_cms_job_preference", parentSysId);

for (const job of employmentList) {                  // job history
  await jobsendToServiceNow({
    parent_sys_id: parentSysId,
    company_name: job.companyName,
    job_position: job.jobPosition,
    employment_period: job.employmentPeriod,
    last_drawn_salary: job.salary
  });
}

await sendJobChoicesToServiceNow(jobChoices, parentSysId);  ////job preference


    console.log("✔ Created record in ServiceNow:");
      //console.log("✔ Created record in ServiceNow:", jobresult);
    res.json({ status: "success" });
  } catch (err) {
    console.error("❌ Failed to send to ServiceNow:", err);
    res.status(500).json({ error: "ServiceNow error" });
  }
    
        //return res.status(200).send({ message: 'Success' })
        } else {
            // Could not decrypt the submission
            return res.status(400).send({ message: 'Bad Request' })
        }
         
    }
)

app.listen(8080, () => console.log('Running on port 8080'))
