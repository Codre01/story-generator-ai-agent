var express = require('express');
var router = express.Router();
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const hbs = require('hbs');

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
router.get("/getStory", function (req, res, next) {
  // Retrieve the story data from the session or parameters
  res.render('story');
});
//const DEEPINFRA_API_KEY = process.env.DEEPINFRA_API_KEY;
// const genAI = new GoogleGenerativeAI(process.env.GEN_AI_API_KEY);
// const groq = new Groq({
//   apiKey: process.env.GROQ_API_KEY
// });
router.post("/story", async function (req, res, next) {
  const { book_title, book_description, character, page_no, min_age, max_age, base_url, api_key, model } = req.body

  try {
    //First Prompt process
    let prompt1 = fs.readFileSync(path.join(__dirname, "prompts/prompt1.txt"), "utf-8");
    let promptText = prompt1;

    // Replace placeholders in the prompt text
    promptText = promptText.replace("[book_title]", book_title);
    promptText = promptText.replace("[book_description]", book_description);
    promptText = promptText.replace("[character]", character);
    promptText = promptText.replace("[page_no]", page_no);
    promptText = promptText.replace("[min_age]", min_age);
    promptText = promptText.replace("[max_age]", max_age);

    prompt1 = promptText; // Update the prompt text with the replaced placeholders
    let firstResult;
    try {
      firstResult = await getGroqChatCompletion(base_url, api_key, model, prompt1);
    } catch (error) {
      return error.stack
    }

    //Print the completion returned by the LLM.
    //log(chatCompletion.choices[0]?.message?.content || "");

    log("firstResult: ", firstResult);
    if(!firstResult) return res.render('index', { error: "No story generated" });
    let jsonData;
    try {
      jsonData = JSON.parse(firstResult);
    } catch (error) {
      return error.stack
    }

    let storyObject = jsonData;
    let formattedText = convertJsonToTextFormat(jsonData);
    fs.writeFileSync(path.join(__dirname, "../story/story.txt"), formattedText, "utf-8");


    //Second Prompt process
    let prompt2 = fs.readFileSync(path.join(__dirname, "prompts/prompt2.txt"), "utf-8");
    let story = fs.readFileSync(path.join(__dirname, "../story/story.txt"), "utf-8");
    prompt2 = prompt2.replace("[story]", story);
    // log("prompt2: ", prompt2);
    let secondResult;
    try {
      secondResult = await getGroqChatCompletion(base_url, api_key, model, prompt2);
    } catch (error) {
      return error.message
    }

    log("secondResult: ", secondResult);
    if(!secondResult) return res.render('index', { error: "No story generated" });
    let imageDescriptionObject;
    try {
      imageDescriptionObject = JSON.parse(secondResult);
    } catch (error) {
      return error.message
    }
    log("imageDescriptionObject: ", imageDescriptionObject);
    //forEach imageDescription in imageDescriptionJson get the alt and add it to each of the jsonData.story
    storyObject.story.forEach((storyPage, index) => {
      storyPage.alt = imageDescriptionObject?.imageDescription[index]?.alt ?? "no image description";
      storyPage.image = `${imageDescriptionObject.imageDescription[index].page}.png`;
      fs.copyFileSync(path.join(__dirname, `../public/noimage.png`), path.join(__dirname, `../story/${imageDescriptionObject.imageDescription[index].page}.png`));
      fs.copyFileSync(path.join(__dirname, `../public/noimage.png`), path.join(__dirname, `../public/${imageDescriptionObject.imageDescription[index].page}.png`));
    });
    log("storyObject: ", storyObject);
    let storyObjectResult = storyObject;
    // let storyJson = JSON.stringify(storyObject, null, 2);
    fs.writeFileSync(path.join(__dirname, "../story/story.json"), JSON.stringify(storyObject, null, 2), "utf-8");

    //copy an image file in ../public/images to ../story.
    
    log("storyObjectResult: ", storyObjectResult);
    try {
      // Render the template with any necessary data
      res.render('story', { story: storyObjectResult });
      return res.render('story', { story: storyObjectResult });
    } catch (error) {
      console.log("error: ", error);
      return res.render('index', { error: error.message });
    }
    
  } catch (error) {
    log("error: ", error);
    return res.render('index', { error: error.message });
  }
})

router.post("/download", async function (req, res, next) {

  try {
    // Get the current file path from the request body
    const filePath = path.join(__dirname, '../views/story.hbs');

    // Read the Handlebars file
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // Compile the Handlebars template
    const template = hbs.compile(fileContent);

    let storyJson = fs.readFileSync(path.join(__dirname, '../story/story.json'), 'utf-8');
    storyJson = JSON.parse(storyJson);
    // Render the template with any necessary data
    const html = template({ story: storyJson });

    // Create the download folder if it doesn't exist
    const downloadFolder = path.join(__dirname, '..', 'story');


    // Generate a unique filename for the HTML file
    const fileName = `story.html`;
    const downloadPath = path.join(downloadFolder, fileName);

    // Write the HTML content to the file
    fs.writeFileSync(downloadPath, html);

  } catch (err) {
    console.error('Error downloading file:', err);
    //res.status(500).json({ error: 'Failed to download file' });
  }
  //zip the ../story folder and download it
  const archive = archiver('zip', {
    zlib: { level: 9 } // Sets the compression level.
  });

  archive.on('error', function (err) {
    res.send(err);
  });

  archive.pipe(res);

  archive.directory(path.join(__dirname, "../story"), false);
  archive.finalize();

});

async function getGroqChatCompletion(base_url, API_KEY, model, prompt) {
  const url = base_url || 'https://api.groq.com/openai/v1/chat/completions';
  const apiKey = API_KEY || process.env.GROQ_API_KEY;
  const AIModel = model || 'mixtral-8x7b-32768';

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

async function runGoogleAi(prompt) {
  // For text-only input, use the gemini-pro model
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  return text;
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
