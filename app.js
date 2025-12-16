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
            ////////////////mapping logic///////////////////
            // 2) Extract FormSG responses
  //const body = req.body;
  //const responses = body?.data?.responses || [];

  //function findField(name) {
   // const f = submission.response.answer.find((r) =>
    //typeof r?.question === 'string' &&
     // r.question.toLowerCase().includes(name.toLowerCase())
    //);
    //return f?.answer || null;
  //}

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


  const mapped = {
    name: findField(submission,"Demo"),
    description: findField(submission,"Type of Application"),
    unique_number: findField(submission,"Type of Employment Assistance required"),
    name: findField(submission,"Programme Details"),
    description: findField(submission,"Programme Status"),
    unique_number: findField(submission,"Inmate No."),
    name: findField(submission,"Date of Release (EDR)"),
    description: findField(submission,"Programme Emplacement Date"),
    unique_number: findField(submission,"Have you attended any Job Preparation (JP) session by YRSG for your current incarceration?"),
    name: findField(submission,"Where did you attend the Job Preparation (JP) session?"),
    description: findField(submission,"Are you being assisted by any staff from Yellow Ribbon Singapore (YRSG) or Selarang Halfway House?"),
    unique_number: findField(submission,"Name and Contact Number of Yellow Ribbon Singapore (YRSG) or Selarang Halfway House staff who is assisting you"),
    name: findField(submission,"Current or Last Offence"),
    description: findField(submission,"Reintegration Officer (RO)'s Name and Contact Number"),
    unique_number: findField(submission,"Personal Information"),
    name1: findField(submission,"Name"),
    unique_number: findField(submission,"NRIC"),
    description: findField(submission,"Nationality"),
    unique_number: findField(submission,"Sex"),
    description: findField(submission,"Race"),
    unique_number: findField(submission,"Date of Birth"),
    unique_number: findField(submission,"Marital Status"),
    description: findField(submission,"National Service"),
    unique_number: findField(submission,"Contact Number"),
    unique_number: findField(submission,"Email"),
    description: findField(submission,"Next-of-Kin's Name"),
    unique_number: findField(submission,"Next-of-Kin's Contact Number"),
    unique_number: findField(submission,"Local address"),
    description: findField(submission,"Do you have any visible tattoo?"),
    unique_number: findField(submission,"Tattoo Details"),
    unique_number: findField(submission,"Education / Language Proficiency / Skills"),
    description: findField(submission,"Highest Educational Level"),
    unique_number: findField(submission,"Specialisation/Field of Highest Education"),
    unique_number: findField(submission,"Spoken (Language)"),
    description: findField(submission,"Written (Language)"),
    unique_number: findField(submission,"Driving/Vocational Licence/Certification"),
    description: findField(submission,"Employment History"),
    unique_number: findField(submission,"Job History (Company Name, Job Position, Period of Employment MM/YY to MM/YY (e.g. 10/20 to 08/22), Salary)"),
    description: findField(submission,"Job Choice 1: Position Requested"),
    unique_number: findField(submission,"Job Choice 1: Expected Salary"),
    description: findField(submission,"Job Choice 1: Requested Work Region"),
    unique_number: findField(submission,"Job Choice 2: Position Requested"),
    description: findField(submission,"Job Choice 2: Expected Salary"),
    unique_number: findField(submission,"Job Choice 2: Requested Work Region"),
    description: findField(submission,"Work hours preference"),
    unique_number: findField(submission,"For Clients with Religious Preferences: F&B/Grocery/Food Delivery Jobs"),
  };

  console.log("📦 Mapped payload:", mapped);

  // 3) Send to ServiceNow

module.exports = async function sendToServiceNow(data) {
  const url = `${process.env.SERVICENOW_INSTANCE}/api/now/table/${process.env.SERVICENOW_TABLE}`;

  const auth = Buffer.from(
    `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
  ).toString('base64');

  const payload = {
    u_full_name: data.name1,
    u_inmate_no: data.unique_number,
    u_short_description: data.description
  };

  const response = await axios.post(url, payload, {
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json"
    }
  });

  return response.data;
};
    //
  try {
    const result = await sendToServiceNow(mapped);
    console.log("✔ Created record in ServiceNow:", result);
    res.json({ status: "success" });
  } catch (err) {
    console.error("❌ Failed to send to ServiceNow:", err);
    res.status(500).json({ error: "ServiceNow error" });
  }

        /////////////
            /////////////////////////////maping logic end///////////////
            return res.status(200).send({ message: 'Success' })
        } else {
            // Could not decrypt the submission
            return res.status(400).send({ message: 'Bad Request' })
        }

         
    }
)

app.listen(8080, () => console.log('Running on port 8080'))
