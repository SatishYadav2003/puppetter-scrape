// index.js
const express = require('express');
const puppeteer = require('puppeteer-core');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Utility function to launch Puppeteer
async function launchBrowser() {
  try {
    return await puppeteer.launch({
      headless: 'new',
      executablePath: '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (err) {
    console.error('Failed to launch Puppeteer:', err);
    throw err;
  }
}

// Scraper function
async function getDownloadLinks(downloadPageUrl) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ referer: downloadPageUrl });

    await page.goto(downloadPageUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    const cookies = await page.cookies();
    const mastDivs = await page.$$('div.mast');
    const downloadLinks = [];

    for (const mastDiv of mastDivs) {
      const previousElements = await page.evaluate((el) => {
        let prevSiblings = [];
        let sibling = el.previousElementSibling;
        while (sibling) {
          prevSiblings.push(sibling.className);
          sibling = sibling.previousElementSibling;
        }
        return prevSiblings;
      }, mastDiv);

      if (previousElements.includes('jatt') || previousElements.includes('jatt1')) {
        const linkElement = await mastDiv.$('a');
        if (linkElement) {
          const linkText = await page.evaluate((el) => el.innerText, linkElement);
          if (/(HDRip|BluRay|240p|480p)/.test(linkText)) {
            const href = await page.evaluate((el) => el.href, linkElement);
            const userAgent = await page.evaluate(() => navigator.userAgent);

            downloadLinks.push({
              resolution: linkText,
              url: href,
              headers: {
                referer: downloadPageUrl,
                'user-agent': userAgent,
                cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
              },
            });
          }
        }
      }
    }

    await browser.close();
    return downloadLinks.length ? { downloadLinks } : { error: 'No matching download links found' };
  } catch (error) {
    console.error('Scraper Error:', error);
    if (browser) await browser.close();
    return { error: 'Failed to scrape download links. Please try again.' };
  }
}

// API Route
app.get('/get-download-links', async (req, res) => {
  const { url } = req.query;

  if (!url) return res.status(400).json({ error: 'Missing URL query parameter.' });

  try {
    const result = await getDownloadLinks(url);
    res.json(result);
  } catch (err) {
    console.error('Server Error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Health Check
app.get('/ping', (req, res) => {
  res.send('pong');
});

app.listen(port, () => {
  console.log(`✅ Server listening at http://localhost:${port}`);
});
