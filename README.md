# Woodora furniture website

Premium, responsive React + Vite storefront concept for a wood furniture manufacturer and showroom.

## Run the frontend
1. Install Node.js (18+).
2. Run `npm install`
3. Run `npm run dev`

## Gemini AI backend (starter)
1. `cd backend`
2. Create a virtual environment and install `pip install -r requirements.txt`
3. Set `GEMINI_API_KEY` in your environment (never place it in frontend code).
4. Run `uvicorn main:app --reload --port 8000`
5. Configure a development proxy from `/api` to `http://localhost:8000`, or deploy frontend and backend behind the same domain.

The frontend currently falls back to a clearly labelled demo response if the API is unavailable. The enquiry form is front-end demo only and needs a mail/CRM endpoint before production use.

## Before production
- Replace sample Unsplash photography with licensed brand/product photos.
- Verify all product names, wood species, dimensions and prices.
- Add backend validation, rate limiting, logging and privacy notice.
- Connect enquiry form to email/CRM and AI endpoint.
