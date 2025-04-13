const express = require('express');
const puppeteer = require('puppeteer');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

async function getDownloadLinks(downloadPageUrl) {
  const browser = await puppeteer.launch({
    headless: true, // Run in headless mode (no UI)
    args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for cloud environments like Render
  });

  const page = await browser.newPage();
  console.log('Initial blank tab created');

  try {
    await page.goto(downloadPageUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    console.log('Initial page opened:', downloadPageUrl);

    // Wait for possible redirect/popup
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Get all div elements with class "mast"
    const mastDivs = await page.$$('div.mast');
    console.log('Number of mast divs found:', mastDivs.length);

    const downloadLinks = [];

    // Iterate over each mast div and check if it’s preceded by a jatt or jatt1 element
    for (let i = 0; i < mastDivs.length; i++) {
      const mastDiv = mastDivs[i];

      // Evaluate the classes of previous siblings for this mast div
      const previousElements = await page.evaluate((el) => {
        let prevSiblings = [];
        let sibling = el.previousElementSibling;
        while (sibling) {
          prevSiblings.push(sibling.className);
          sibling = sibling.previousElementSibling;
        }
        return prevSiblings;
      }, mastDiv);

      // If this mast div is immediately following a "jatt" or "jatt1" element, proceed
      if (previousElements.includes('jatt') || previousElements.includes('jatt1')) {
        console.log(`Found mast div after jatt or jatt1 (index ${i})`);

        // Look for an anchor tag inside this mast div
        const linkElement = await mastDiv.$('a');
        if (linkElement) {
          const linkText = await page.evaluate((el) => el.innerText, linkElement);
          // Filter for specific download resolutions (HDRip or BluRay)
          if (linkText.includes('HDRip') || linkText.includes('BluRay')) {
            const href = await page.evaluate((el) => el.href, linkElement);
            downloadLinks.push({ resolution: linkText, url: href });
          }
        }
      }
    }

    await browser.close();

    return downloadLinks.length 
      ? { downloadLinks } 
      : { error: 'No matching download links found' };
  } catch (error) {
    console.error('Error fetching the page or parsing:', error);
    await browser.close();
    return { error: 'An error occurred while fetching the download links' };
  }
}

app.get('/get-download-links', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL query parameter is required' });
  }
  const result = await getDownloadLinks(url);
  res.json(result);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
