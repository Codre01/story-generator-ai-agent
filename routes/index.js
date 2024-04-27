var express = require('express');
var router = express.Router();
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const hbs = require('hbs');
const {Validate} = require("./helper/Validate.js")

const log = console.log;
let story = path.join(__dirname, "../story");
if (!fs.existsSync(story)) {
  fs.mkdirSync(story);
}
router.get('/', function (req, res, next) {
  res.render('index');
});

router.get('/settings', function (req, res) {
  res.render('settings');
});

router.post("/story", async (req, res, next) => {
  try {
    const { book_title, book_description, character, page_no, min_age, max_age, base_url, api_key, model } = req.body;

    // Validate input fields
    const validationErrors = [];
    if (!Validate.string(book_title) || !book_title) validationErrors.push("Enter a book title");
    if (!Validate.string(book_description) || !book_description) validationErrors.push("Enter a book description");
    if (!Validate.string(character) || !character) validationErrors.push("Enter your preferred book characters.");
    if (!Validate.integer(+page_no) || !page_no) validationErrors.push("Enter numbers of book page");
    if (!Validate.integer(+min_age) || !min_age) validationErrors.push("Enter a minimum age");
    if (!Validate.integer(+max_age) || !max_age) validationErrors.push("Enter a maximum age");
    if (!Validate.URL(base_url) || !base_url) validationErrors.push("Go to the settings and set your AI base url");
    if (!Validate.string(api_key) || !api_key || api_key.length < 10) validationErrors.push("Go to the settings and set your API KEY");
    if (!Validate.string(model) || !model) validationErrors.push("Go to the settings and set your AI model");

    if (validationErrors.length > 0) {
      return res.render("index", { error: validationErrors.join(', ') });
    }

    // First Prompt process
    const prompt1 = fs.readFileSync(path.join(__dirname, "prompts/prompt1.txt"), "utf-8");
    let promptText = prompt1;

    // Replace placeholders in the prompt text
    promptText = promptText.replace("[book_title]", book_title);
    promptText = promptText.replace("[book_description]", book_description);
    promptText = promptText.replace("[character]", character);
    promptText = promptText.replace("[page_no]", page_no);
    promptText = promptText.replace("[min_age]", min_age);
    promptText = promptText.replace("[max_age]", max_age);

    const firstResult = await getGroqChatCompletion(base_url, api_key, model, promptText);
    if (!firstResult) return res.render('index', { error: "No story generated" });

    const storyObject = JSON.parse(firstResult);
    const formattedText = convertJsonToTextFormat(storyObject);
    fs.writeFileSync(path.join(__dirname, "../story/story.txt"), formattedText, "utf-8");

    // Second Prompt process
    const prompt2 = fs.readFileSync(path.join(__dirname, "prompts/prompt2.txt"), "utf-8");
    const story = fs.readFileSync(path.join(__dirname, "../story/story.txt"), "utf-8");
    const prompt2Text = prompt2.replace("[story]", story);

    const secondResult = await getGroqChatCompletion(base_url, api_key, model, prompt2Text);
    if (!secondResult) return res.render('index', { error: "No story generated" });

    const imageDescriptionObject = JSON.parse(secondResult);

    // Update storyObject with image descriptions
    storyObject.story.forEach((storyPage, index) => {
      const imageDescription = imageDescriptionObject?.imageDescription[index] || { alt: "no image description" };
      storyPage.imagePrompt = imageDescription.alt;
      storyPage.filename = `${imageDescription.page}.png`;

      const noImagePath = path.join(__dirname, '../public/noimage.png');
      const storyImagePath = path.join(__dirname, `../story/${imageDescription.page}.png`);
      const publicImagePath = path.join(__dirname, `../public/${imageDescription.page}.png`);

      fs.copyFileSync(noImagePath, storyImagePath);
      fs.copyFileSync(noImagePath, publicImagePath);
    });

    const storyObjectResult = storyObject;
    fs.writeFileSync(path.join(__dirname, "../story/story.json"), JSON.stringify(storyObject, null, 2), "utf-8");

    res.render('story', { story: storyObjectResult });
  } catch (error) {
    console.error("Error:", error);
    res.render('index', { error: error.message });
  }
});
router.post("/download", async (req, res, next) => {
  try {
    // Get the current file path
    const filePath = path.join(__dirname, '../views/story.hbs');

    // Read the Handlebars file
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // Compile the Handlebars template
    const template = hbs.compile(fileContent);

    // Read the story JSON file
    const storyJsonPath = path.join(__dirname, '../story/story.json');
    const storyJson = JSON.parse(fs.readFileSync(storyJsonPath, 'utf-8'));

    // Render the template with story data
    const html = template({ story: storyJson });

    // Create the download folder if it doesn't exist
    const downloadFolder = path.join(__dirname, '..', 'story');
    fs.mkdirSync(downloadFolder, { recursive: true });

    // Generate a unique filename for the HTML file
    const fileName = 'story.html';
    const downloadPath = path.join(downloadFolder, fileName);

    // Write the HTML content to the file
    fs.writeFileSync(downloadPath, html);

    // Zip the story folder and send it for download
    const archive = archiver('zip', { zlib: { level: 9 } }); // Sets the compression level

    res.attachment(`story.zip`); // Set the desired filename for the downloadable zip file

    // Handle archiver errors
    archive.on('error', (err) => {
      res.status(500).send({ error: 'Failed to create zip archive' });
    });

    // Pipe the archive to the response
    archive.pipe(res);

    // Add the story folder to the archive
    archive.directory(path.join(__dirname, "../story"), false);

    // Finalize the archive and send the response
    archive.finalize();
  } catch (err) {
    console.error('Error downloading file:', err);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

async function getGroqChatCompletion(base_url, API_KEY, model, prompt) {
  const url = base_url;
  const apiKey = API_KEY;
  const AIModel = model;

  const headers = {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json'
  };
  const data = {
    'messages': [{ 'role': 'user', 'content': prompt }],
    'model': AIModel,
    'response_format': {
      'type': 'json_object'
    }
  };

  try {
    const response = await axios.post(url, data, { headers: headers });
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error(error);
  }
}


function convertJsonToTextFormat(jsonData) {
  let formattedText = `Title: ${jsonData.title}\n${jsonData.description}\n###\n`;

  // Loop through each page in the story array
  jsonData.story.forEach((page) => {
    formattedText += `page${page.page}\n${page.text}\n###\n`;
  });

  // Remove the last '###\n' from the string if not needed
  formattedText = formattedText.slice(0, -4);

  return formattedText;
}
module.exports = router;
