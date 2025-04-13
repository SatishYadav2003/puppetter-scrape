const express = require('express');
const puppeteer = require('puppeteer-core');
const dotenv = require('dotenv');
const { executablePath } = require('puppeteer'); // Make sure puppeteer-core is using executablePath

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Function to get download links dynamically from multiple "mast" divs
async function getDownloadLinks(downloadPageUrl) {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium', // Point to the installed chromium in Docker (or Render environment)
    args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for cloud environments like Render
  });

  const page = await browser.newPage();

  // Set user-agent and referer headers
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({
    referer: downloadPageUrl,
  });

  try {
    await page.goto(downloadPageUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Get cookies from the page for further requests
    const cookies = await page.cookies();

    // Get all mast divs on the page
    const mastDivs = await page.$$('div.mast');
    const downloadLinks = [];

    // Loop through each mast div to find download links
    for (let i = 0; i < mastDivs.length; i++) {
      const mastDiv = mastDivs[i];

      // Check previous elements to identify if this mast div follows 'jatt' or 'jatt1'
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
          if (linkText.includes('HDRip') || linkText.includes('BluRay') || linkText.includes('240p') || linkText.includes('480p')) {
            const href = await page.evaluate((el) => el.href, linkElement);
            downloadLinks.push({
              resolution: linkText,
              url: href,
              headers: {
                referer: downloadPageUrl,
                'user-agent': await page.evaluate(() => navigator.userAgent),
                cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
              },
            });
          }
        }
      }
    }

    await browser.close();

    if (downloadLinks.length > 0) {
      return { downloadLinks };
    } else {
      return { error: 'No matching download links found' };
    }
  } catch (error) {
    console.error('Error fetching the page or parsing:', error);
    await browser.close();
    return { error: 'An error occurred while fetching the download links' };
  }
}

// Define API route to get download links
app.get('/get-download-links', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL query parameter is required' });
  }

  try {
    const result = await getDownloadLinks(url);
    res.json(result);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'An error occurred while fetching the download links' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`✅ Server running locally at http://localhost:${port}`);
});
