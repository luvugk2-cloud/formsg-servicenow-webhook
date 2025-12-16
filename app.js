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

function findField(submission, keyword) {
  const answers = submission?.response?.answers;

  if (!Array.isArray(answers)) return null;

  const item = answers.find(a =>
    typeof a?.question === 'string' &&
    a.question.toLowerCase().includes(keyword.toLowerCase())
  );

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

/////

// 3) Send to ServiceNow

async function sendToServiceNow(data) {
  const url = `${process.env.SERVICENOW_INSTANCE}/api/now/table/${process.env.SERVICENOW_TABLE}`;

  const auth = Buffer.from(
    `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
  ).toString('base64');

  const payload = {
    u_full_name: data.name1,
    u_inmate_no: data.inmate_no
  };

  const response = await axios.post(url, payload, {
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json"
    }
  });

  return response.data;
};

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
  const mapped = {
    demo: findField(submission,"Demo"),
    type_of_application: findField(submission,"Type of Application"),
    employment_assistance: findField(submission,"Type of Employment Assistance required"),
    programme_details: findField(submission,"Programme Details"),
    programme_status: findField(submission,"Programme Status"),
    inmate_no: findField(submission,"Inmate No."),
    dor: findField(submission,"Date of Release (EDR)"),
    programme_emplacement_date: findField(submission,"Programme Emplacement Date"),
    jp_attend: findField(submission,"Have you attended any Job Preparation (JP) session by YRSG for your current incarceration?"),
    where_jp_attend: findField(submission,"Where did you attend the Job Preparation (JP) session?"),
    assisted_by_yrsg: findField(submission,"Are you being assisted by any staff from Yellow Ribbon Singapore (YRSG) or Selarang Halfway House?"),
    name_yrsg: findField(submission,"Name and Contact Number of Yellow Ribbon Singapore (YRSG) or Selarang Halfway House staff who is assisting you"),
    current_last_offence: findField(submission,"Current or Last Offence"),
    ro_name: findField(submission,"Reintegration Officer (RO)'s Name and Contact Number"),
    personal_information: findField(submission,"Personal Information"),
    name1: findField(submission,"Name"),
    nric: findField(submission,"NRIC"),
    nationality: findField(submission,"Nationality"),
    sex: findField(submission,"Sex"),
    race: findField(submission,"Race"),
    dob: findField(submission,"Date of Birth"),
    marital_status: findField(submission,"Marital Status"),
    national_service: findField(submission,"National Service"),
    contact_number: findField(submission,"Contact Number"),
    email: findField(submission,"Email"),
    NOK_name: findField(submission,"Next-of-Kin's Name"),
    NOK_contact_number: findField(submission,"Next-of-Kin's Contact Number"),
    local_address: findField(submission,"Local address"),
    tattoo: findField(submission,"Do you have any visible tattoo?"),
    tatto_details: findField(submission,"Tattoo Details"),
    els: findField(submission,"Education / Language Proficiency / Skills"),
    hel: findField(submission,"Highest Educational Level"),
    she: findField(submission,"Specialisation/Field of Highest Education"),
    spoken: findField(submission,"Spoken (Language)"),
    written: findField(submission,"Written (Language)"),
    dlc: findField(submission,"Driving/Vocational Licence/Certification"),
    employment_history: findField(submission,"Employment History"),
    cjp: findField(submission,"Job History (Company Name, Job Position, Period of Employment MM/YY to MM/YY (e.g. 10/20 to 08/22), Salary)"),
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
    try {
    const result = await sendToServiceNow(mapped);
    console.log("✔ Created record in ServiceNow:", result);
    res.json({ status: "success" });
  } catch (err) {
    console.error("❌ Failed to send to ServiceNow:", err);
    res.status(500).json({ error: "ServiceNow error" });
  }
    
        return res.status(200).send({ message: 'Success' })
        } else {
            // Could not decrypt the submission
            return res.status(400).send({ message: 'Bad Request' })
        }
         
    }
)

app.listen(8080, () => console.log('Running on port 8080'))
