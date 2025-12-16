// This example uses Express to receive webhooks
const express = require('express')
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

app.get('/perm-test-dev/container/jia-jun-poc-upuu9-fe-suffix/', (req, res) => {
    res.status(200).send('Hello, this is the FormSG webhook receiver!')
});

app.post('/perm-test-dev/container/jia-jun-poc-upuu9-fe-suffix/submissions',
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
            return res.status(200).send({ message: 'Success' })
        } else {
            // Could not decrypt the submission
            return res.status(400).send({ message: 'Bad Request' })
        }
    }
)

app.listen(8080, () => console.log('Running on port 8080'))
