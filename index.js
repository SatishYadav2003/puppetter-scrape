const express = require('express');
const puppeteer = require('puppeteer');
const dotenv = require("dotenv")

dotenv.config()

const app = express();
const port = process.env.PORT || 3000;

// Function to get download links dynamically from multiple "mast" divs
async function getDownloadLinks(downloadPageUrl) {
  const browser = await puppeteer.launch({
    headless: true, // Set to false if you want to see the browser
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  console.log('Initial blank tab created');

  await page.goto(downloadPageUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  console.log('Initial page opened:', downloadPageUrl);

  // Wait for possible redirect/popup
  await new Promise(resolve => setTimeout(resolve, 3000));

  const mastDivs = await page.$$('div.mast');
  console.log('Number of mast divs found:', mastDivs.length);

  if (mastDivs.length === 0) {
    await browser.close();
    return { error: 'No mast divs found on the page' };
  }

  const downloadLinks = [];

  // Identify the mast divs that contain valid download links
  for (let i = 0; i < mastDivs.length; i++) {
    const mastDiv = mastDivs[i];

    // Check if this mast div comes after 'jatt' or 'jatt1' divs
    const previousElements = await page.evaluate((el) => {
      let prevSiblings = [];
      let sibling = el.previousElementSibling;
      while (sibling) {
        prevSiblings.push(sibling.className);
        sibling = sibling.previousElementSibling;
      }
      return prevSiblings;
    }, mastDiv);

    // If this mast div follows 'jatt' or 'jatt1', check for the download link
    if (previousElements.includes('jatt') || previousElements.includes('jatt1')) {
      console.log(`Found mast div after jatt or jatt1 (index ${i})`);

      // Check if the mast div contains a download link (anchor tag)
      const linkElement = await mastDiv.$('a');
      if (linkElement) {
        const linkText = await page.evaluate(el => el.innerText, linkElement);
        if (linkText.includes('HDRip') || linkText.includes('BluRay')) {
          const href = await page.evaluate(el => el.href, linkElement);
          downloadLinks.push({ resolution: linkText, url: href });
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
  console.log(`Server running on port ${port}`);
});
