# Source77 Store - Setup Guide

## What you have
- A complete online store for Source77 LLC
- Static storefront hosted free on AWS Amplify (HTTPS included)
- Serverless backend on AWS Lambda + DynamoDB (free tier)
- Stripe card payments (no monthly fee -- only 2.9% + 30¢ per sale)
- Admin panel at /admin/ to manage products and orders

---

## Prerequisites

Before you start, make sure you have these five things set up. Each link takes you to the download or sign-up page.

| What | Why you need it | Link |
|------|-----------------|------|
| Node.js 18+ | Runs the backend install step | [nodejs.org](https://nodejs.org) |
| AWS account | Hosts everything (free tier) | [aws.amazon.com](https://aws.amazon.com) |
| AWS CLI | Lets your computer talk to AWS | [AWS CLI install guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) |
| AWS SAM CLI | Deploys the backend functions | [SAM CLI install guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) |
| Stripe account | Handles card payments | [stripe.com](https://stripe.com) |
| GitHub account | Stores your code so Amplify can deploy it | [github.com](https://github.com) |

---

## Step 1 - Deploy the backend

Open your terminal, go into the backend folder, and run these four commands one at a time:

```bash
cd backend
npm install
sam build
sam deploy --guided
```

When it asks you questions, answer like this:
- **Stack Name:** `source77-backend`
- **AWS Region:** `us-east-1`
- **Confirm changes before deploy:** `yes`
- Everything else: press Enter to accept the default

At the very end it prints a table. **Copy the `ApiGatewayUrl` value** -- you'll need it in Steps 2 and 3.

---

## Step 2 - Get your Stripe keys

1. Log in at [stripe.com](https://stripe.com)
2. Click **Developers** in the top menu, then **API keys**
3. Copy both keys:
   - **Publishable key** -- starts with `pk_test_`
   - **Secret key** -- starts with `sk_test_`

Then set up your payment webhook so Stripe can notify your store when someone pays:

1. In Stripe Dashboard go to **Developers > Webhooks > Add endpoint**
2. **Endpoint URL:** paste your `ApiGatewayUrl` from Step 1, then add `/webhook/stripe` at the end
   - Example: `https://abc123.execute-api.us-east-1.amazonaws.com/prod/webhook/stripe`
3. **Event to listen for:** `checkout.session.completed`
4. Click **Add endpoint**, then copy the **Webhook Signing Secret** (starts with `whsec_`)

---

## Step 3 - Set Lambda environment variables

This is where you give your backend functions the secret keys they need. Do this in the AWS Console -- no coding required.

Go to [AWS Console](https://console.aws.amazon.com) > **Lambda**, then open each function and go to **Configuration > Environment variables > Edit**.

| Function | Variable name | Value |
|----------|--------------|-------|
| `CheckoutFunction` | `STRIPE_SECRET_KEY` | Your `sk_test_` key from Step 2 |
| `CheckoutFunction` | `FRONTEND_URL` | Your Amplify URL (you'll get this in Step 5 -- come back) |
| `WebhookFunction` | `STRIPE_SECRET_KEY` | Your `sk_test_` key from Step 2 |
| `WebhookFunction` | `STRIPE_WEBHOOK_SECRET` | Your `whsec_` key from Step 2 |
| `ProductsFunction` | `ADMIN_KEY` | A secret password you choose (keep it private) |
| `OrdersFunction` | `ADMIN_KEY` | Same password as above |

> **Note:** You won't have your Amplify URL yet when you first do this step. Set everything else, then come back after Step 5 to add `FRONTEND_URL`.

---

## Step 4 - Update the frontend config

Open the file `public/js/config.js` in a text editor and update these three values:

| Setting | What to put there |
|---------|-------------------|
| `API_BASE_URL` | Your `ApiGatewayUrl` from Step 1 |
| `STRIPE_PUBLISHABLE_KEY` | Your `pk_test_` key from Step 2 |
| `ADMIN_PASSWORD` | The password you chose for /admin/ |

Save the file.

---

## Step 5 - Deploy to Amplify

1. Push your project folder to GitHub (create a new repository)
2. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify)
3. Click **New app > Host web app**
4. Choose **GitHub**, connect your account, and select your repository and the `main` branch
5. Amplify will detect the `amplify.yml` file automatically -- no extra settings needed
6. Click **Save and deploy**
7. Wait a few minutes. When it finishes, **copy your Amplify URL** -- it looks like `https://main.xxxxxx.amplifyapp.com`

Now go back to Step 3 and add that URL as `FRONTEND_URL` in the `CheckoutFunction`.

---

## Step 6 - Add your products

1. Go to `YOUR_STORE_URL/admin/`
2. Log in with your `ADMIN_PASSWORD`
3. Click the **Products** tab
4. Edit the sample products with your real inventory -- name, price, description, and image

---

## Step 7 - Connect your domain (later, when ready)

You can do this any time after the store is live and working.

1. In Amplify Console, open your app and click **Domain management > Add domain**
2. Enter `source77llc.com`
3. Follow the DNS instructions Amplify shows you (you'll update a few records with your domain registrar)
4. Once the domain is active, go back to Lambda and update `FRONTEND_URL` in `CheckoutFunction` to your new domain

---

## Managing your store day-to-day

| Task | How |
|------|-----|
| Add or edit products | Go to `/admin/` > **Products** tab |
| View and update orders | Go to `/admin/` > **Orders** tab (statuses: new → shipped → picked up) |
| Update your Herbalife link | Edit `HERBALIFE_URL` in `public/js/config.js` |
| Add a coloring book | Copy a book card in `public/books.html`, update the title and Amazon link |

---

## Security checklist (do before going live with real money)

- [ ] Change `ADMIN_PASSWORD` in `config.js` to something strong (not "admin" or "password")
- [ ] Never paste your Stripe **secret key** into GitHub -- only the publishable key is safe to commit
- [ ] Switch Stripe from test keys (`sk_test_`, `pk_test_`) to live keys (`sk_live_`, `pk_live_`) only after you've tested a full purchase end-to-end

---

## Monthly cost (AWS free tier)

Everything below is free within AWS free tier limits. For a small store, you're unlikely to exceed them.

| Service | Free tier |
|---------|-----------|
| Amplify hosting | Free for 12 months (5 GB storage, 15 GB/month transfer) |
| Lambda functions | Free forever (1 million calls/month) |
| DynamoDB database | Free forever (25 GB storage) |
| API Gateway | Free for 12 months (1 million calls/month) |
| Stripe | No monthly fee -- 2.9% + 30¢ per transaction only |

---

## Contact / support

For technical help, reopen this project in Kiro or reach out to your developer.
