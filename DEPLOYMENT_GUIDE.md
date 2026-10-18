# 🚀 Live Deployment Guide (Vercel + Supabase + Render)

এই প্রজেক্টটি লাইভ করার জন্য ৩টি সহজ ধাপ নিচে দেওয়া হলো:

---

## ধাপ ১: Supabase ডাটাবেস সেটআপ (Database)

1. [Supabase](https://supabase.com)-এ যান এবং একটি ফ্রি অ্যাকাউন্ট খুলে **"New Project"** তৈরি করুন।
2. প্রজেক্ট ড্যাশবোর্ড থেকে বাম পাশের মেনুতে **"SQL Editor"**-এ ক্লিক করুন।
3. **"New query"**-তে ক্লিক করে `backend/supabase_schema.sql` ফাইলের পুরো কোডটি পেস্ট করুন এবং **"Run"** বাটনে ক্লিক করুন।
4. বাম পাশের মেনুতে **Project Settings (গিয়ার আইকন) > API**-তে যান:
   - **Project URL** কপি করুন (এটি আপনার `SUPABASE_URL`)
   - **anon / public key** অথবা **service_role key** কপি করুন (এটি আপনার `SUPABASE_KEY`)

---

## ধাপ ২: Backend লাইভ করা (Render.com বা Railway-তে)

> **নোট:** ভিডিও স্ট্রিমিং ও স্ক্র্যাপিং এর জন্য ব্যাকএন্ড Render/Railway-তে দিতে হবে, কারণ Vercel Serverless ফাংশনে বড় ভিডিও স্ট্রিম টাইমআউট হয়ে যায়।

1. আপনার পুরো কোডটি আপনার **GitHub** রিপোজিটরিতে পুশ করুন:
   ```bash
   git add .
   git commit -m "Production release for Vercel and Supabase"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
2. [Render.com](https://render.com)-এ গিয়ে **New + > Web Service** সিলেক্ট করুন এবং আপনার GitHub Repo কানেক্ট করুন।
3. নিচের সেটিংসগুলো দিন:
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** `Free`
4. **Environment Variables** সেকশনে এই ভ্যালুগুলো যোগ করুন:
   - `PORT` = `10000`
   - `SUPABASE_URL` = (ধাপ ১ এ পাওয়া Supabase URL)
   - `SUPABASE_KEY` = (ধাপ ১ এ পাওয়া Supabase Key)
   - `TMDB_API_KEY` = (আপনার TMDB API Key)
5. **"Create Web Service"**-এ ক্লিক করুন। ২ মিনিটের মধ্যে আপনার ব্যাকএন্ড লাইভ হয়ে যাবে এবং একটি URL পাবেন (যেমন: `https://my-movie-backend.onrender.com`)।

---

## ধাপ ৩: Frontend লাইভ করা (Vercel-এ)

1. [Vercel](https://vercel.com)-এ যান এবং **"Add New... > Project"** সিলেক্ট করে আপনার GitHub Repo ইমপোর্ট করুন।
2. কনফিগারেশনে:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `My-Movie-House-frontend` (Edit বাটনে ক্লিক করে এটি সিলেক্ট করুন)
3. **Environment Variables** সেকশনে:
   - **Name:** `VITE_API_URL`
   - **Value:** (ধাপ ২ এ পাওয়া আপনার Render ব্যাকএন্ডের URL, যেমন: `https://my-movie-backend.onrender.com`)
4. **"Deploy"** বাটনে ক্লিক করুন!

১ মিনিটের মধ্যে আপনার ফ্রন্টএন্ড লাইভ হয়ে যাবে এবং আপনি একটি লাইভ লিংক পাবেন (যেমন: `https://my-movie-house.vercel.app`)! 🎉
