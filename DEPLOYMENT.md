# Deploying Synchro to Vercel

This guide will walk you through deploying your Synchro app to Vercel.

## Prerequisites

- Your code pushed to GitHub at `https://github.com/rusgariana/synchro`
- A GitHub account
- A Vercel account (free tier is fine)

## Step-by-Step Deployment Guide

### 1. Prepare Your Repository

First, make sure all your latest changes are committed and pushed to GitHub:

```bash
# In your project directory
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

> **Note:** If you haven't initialized a git repository yet, run:
> ```bash
> git init
> git remote add origin https://github.com/rusgariana/synchro.git
> git add .
> git commit -m "Initial commit"
> git branch -M main
> git push -u origin main
> ```

### 2. Sign Up / Log In to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **"Sign Up"** (or **"Log In"** if you have an account)
3. Choose **"Continue with GitHub"**
4. Authorize Vercel to access your GitHub account

### 3. Import Your Project

1. Once logged in, click **"Add New..."** → **"Project"**
2. You'll see a list of your GitHub repositories
3. Find **"rusgariana/synchro"** and click **"Import"**

### 4. Configure Your Project

Vercel will automatically detect that this is a Next.js project. You should see:

- **Framework Preset:** Next.js (auto-detected)
- **Root Directory:** `./` (leave as is)
- **Build Command:** `npm run build` (auto-filled)
- **Output Directory:** `.next` (auto-filled)
- **Install Command:** `npm install` (auto-filled)

**You don't need to change anything!** Just click **"Deploy"**.

### 5. Wait for Deployment

Vercel will now:
1. Clone your repository
2. Install dependencies (`npm install`)
3. Build your app (`npm run build`)
4. Deploy it to their CDN

This usually takes 1-3 minutes. You'll see a progress indicator.

### 6. Success! 🎉

Once deployment is complete, you'll see:
- A **"Congratulations"** screen
- Your live URL: `https://synchro-social.vercel.app`
- A preview of your deployed site

Click **"Visit"** to see your live app!

### 7. Set Up Custom Domain (Optional)

If you want a custom domain like `synchro.yourdomain.com`:

1. Go to your project dashboard on Vercel
2. Click **"Settings"** → **"Domains"**
3. Add your custom domain
4. Follow Vercel's instructions to update your DNS records

## Automatic Deployments

Good news! Vercel automatically sets up continuous deployment:

- **Every push to `main`** → Automatically deploys to production
- **Every pull request** → Creates a preview deployment

You can see all deployments in your Vercel dashboard.

## Important Notes

### Session Storage

The signaling API uses **in-memory storage**, which means:
- ✅ Sessions work perfectly while the app is running
- ⚠️ Sessions are **lost when Vercel redeploys** (which happens on every git push)
- ✅ This is fine for an MVP! Users just need to create a new session after a deployment

If you want persistent sessions in the future, you can add Redis or a database.

### Environment Variables

Currently, the app doesn't need any environment variables. If you add any in the future:

1. Go to your project on Vercel
2. Click **"Settings"** → **"Environment Variables"**
3. Add your variables there

## Troubleshooting

### Build Fails

If the build fails, check the build logs on Vercel. Common issues:
- TypeScript errors → Fix them locally and push again
- Missing dependencies → Make sure `package.json` is up to date

### App Doesn't Load

- Check the browser console for errors
- Make sure you're using a wallet (MetaMask, Brave Wallet, etc.)
- Try hard refresh (Cmd+Shift+R or Ctrl+Shift+R)

### Matching Doesn't Work

- Both users must be on the same deployed URL
- Sessions are ephemeral (lost on redeploy)
- Check browser console for errors

## Monitoring

You can monitor your app's performance and errors:
1. Go to your Vercel dashboard
2. Click on your project
3. View **Analytics**, **Logs**, and **Speed Insights**

## Next Steps

- Share your live URL with friends to test!
- Add a custom domain
- Consider adding analytics (Vercel Analytics is built-in)
- Upgrade to persistent session storage if needed

---

**Your Live URL:** Check your Vercel dashboard after deployment!

**Questions?** Check the [Vercel Documentation](https://vercel.com/docs) or open an issue on GitHub.
