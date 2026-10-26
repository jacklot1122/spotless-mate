# Spotless Mate

Static one-page site for Spotless Mate home cleaning (Ryde & greater Sydney).

## Deploy (Vercel)

Import this repo in Vercel: framework preset "Other", no build command, output directory = root.

## Quote form emails (Resend)

The quote form posts to `/api/enquiry` (a Vercel function), which emails the enquiry via Resend.
If sending fails, the page falls back to the copy-and-DM-on-Instagram flow.

Environment variables (Vercel > Project > Settings > Environment Variables):

| Name | Required | Default |
| --- | --- | --- |
| `RESEND_API_KEY` | yes | |
| `ENQUIRY_TO` | no | `Enquiries@spotlessmate.com.au` |
| `ENQUIRY_FROM` | no | `Spotless Mate Website <enquiries@spotlessmate.com.au>` |

`spotlessmate.com.au` must be a verified domain in Resend (Domains > Add domain, then add the DNS records it gives you), or sends will be rejected.
Replies go straight to the customer when they leave an email (set as Reply-To).
Customers who leave an email also get a confirmation ("Thanks for your enquiry...") with a summary of what they sent; replying to it goes to ENQUIRY_TO.