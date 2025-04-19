const express = require('express');
const puppeteer = require('puppeteer-core');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());

// Reusable constants
const chromiumPath = '/usr/bin/chromium';
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getDownloadLinks(downloadPageUrl) {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: chromiumPath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 0,
    });

    const page = await browser.newPage();
    await page.setUserAgent(userAgent);
    await page.setExtraHTTPHeaders({ referer: downloadPageUrl });

    await page.goto(downloadPageUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });

    const cookies = await page.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const navUserAgent = await page.evaluate(() => navigator.userAgent);

    const mastDivs = await page.$$eval("div.mast", (divs) =>
      divs
        .filter(div => div.getAttribute("style")?.trim() === "text-align:left;")
        .map((div, i, arr) => {
          const link = div.querySelector("a");
          const linkText = link?.innerText || "";
          const isLast = i === arr.length - 1;
          const isAppLink = linkText.toLowerCase().includes("download/watch in android app");

          if (!link || (isLast && isAppLink)) return null;

          const sizeMatch = div.innerText.match(/\[\d+ Mb\]/);
          return {
            resolution: linkText,
            size: sizeMatch?.[0]?.slice(1, -1) || '',
            url: link.href,
          };
        })
        .filter(Boolean)
    );

    const downloadLinks = mastDivs.map(link => ({
      ...link,
      headers: {
        referer: downloadPageUrl,
        'user-agent': navUserAgent,
        cookie: cookieHeader,
      },
    }));

    return downloadLinks.length > 0
      ? { downloadLinks }
      : { error: 'No matching download links found' };

  } catch (error) {
    console.error('❌ Scraper Error:', error);
    return { error: 'Failed to scrape download links. Please try again.' };
  } finally {
    if (browser) await browser.close();
  }
}

// Routes
app.get('/ping', (_, res) => res.send('pong'));

app.get('/get-download-links', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing URL parameter.' });

  const result = await getDownloadLinks(url);
  if (result.error) return res.status(500).json(result);

  res.json(result);
});

app.listen(port, () => {
  console.log(`✅ Server listening at http://localhost:${port}`);
});
