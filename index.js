const express = require('express');
const puppeteer = require('puppeteer-core');
const dotenv = require('dotenv');
const cors = require("cors");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());

// Utility function to scrape download links
async function getDownloadLinks(downloadPageUrl) {
  console.log("🔍 Navigating to:", downloadPageUrl);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: '/usr/bin/chromium', // or 'chromium'
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 0,
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ referer: downloadPageUrl });

    await page.goto(downloadPageUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });

    const cookies = await page.cookies();
    const mastDivs = await page.$$('div.mast');
    const downloadLinks = [];

    for (let i = 0; i < mastDivs.length; i++) {
      const mastDiv = mastDivs[i];

      const linkElement = await mastDiv.$('a');
      if (!linkElement) continue;

      const linkText = await page.evaluate(el => el.innerText, linkElement);
      if (linkText.toLowerCase().includes('android app')) continue;

      if (
        linkText.includes('HDRip') ||
        linkText.includes('BluRay') ||
        linkText.includes('240p') ||
        linkText.includes('480p') ||
        linkText.includes('720p') ||
        linkText.includes('1080p')
      ) {
        const href = await page.evaluate(el => el.href, linkElement);
        const sizeText = await mastDiv.evaluate(el =>
          el.innerText.match(/\[\d+ Mb\]/)?.[0] || '', mastDiv
        );

        downloadLinks.push({
          resolution: linkText,
          size: sizeText.replace('[', '').replace(']', ''),
          url: href,
          headers: {
            referer: downloadPageUrl,
            'user-agent': await page.evaluate(() => navigator.userAgent),
            cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
          },
        });
      }
    }

    await browser.close();

    return downloadLinks.length > 0
      ? { downloadLinks }
      : { error: 'No matching download links found' };
  } catch (error) {
    console.error('❌ Scraper Error:', error);
    if (browser) await browser.close();
    return { error: 'Failed to scrape download links. Please try again.' };
  }
}

// Health check
app.get('/ping', (_, res) => res.send('pong'));

// Main endpoint
app.get('/get-download-links', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing URL parameter.' });
  }

  try {
    const result = await getDownloadLinks(url);
    res.json(result);
  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`✅ Server listening at http://localhost:${port}`);
});
