const axios = require('axios');
const cheerio = require('cheerio');
const vscode = require('vscode');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const funny = require("crypto");

let collectedErrors = [];
/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	vscode.languages.onDidChangeDiagnostics(() => {
        collectedErrors = [];

        const diagnostics = vscode.languages.getDiagnostics();
        diagnostics.forEach(([uri, diagnosticList]) => {
            diagnosticList.forEach(diagnostic => {
                if (diagnostic.severity === vscode.DiagnosticSeverity.Error || vscode.DiagnosticSeverity.Warning) {
                    collectedErrors.push(diagnostic.message);
                }
            });
        });
    });

    const disposable = vscode.commands.registerCommand('debug-helper.errorSearch', async () => {

        const selectedError = await vscode.window.showQuickPick(collectedErrors, {
            placeHolder: "Select an error to search for solutions"
        });

        if (selectedError) {
            vscode.window.showInformationMessage(`Searching solutions for: "${selectedError}"`);
            const [scrapedSolutions, genAiSolution] = await Promise.all([
                fetchErrorSolutions(selectedError), 
                generativeAI(selectedError)
            ]);

            if (scrapedSolutions.length > 0 || genAiSolution) {
                showSolutionsInWebview(scrapedSolutions, genAiSolution);
            } else {
                vscode.window.showInformationMessage("No solutions found.");
            }
        }

    });

    context.subscriptions.push(disposable);
}

async function searchSolutions(errorMessage) {
    try {
        const solutions = await fetchErrorSolutions(errorMessage);
        return solutions;
    } catch (error) {
        vscode.window.showErrorMessage(`Error fetching solutions: ${error.message}`);
        return [];
    }
}

async function fetchErrorSolutions(errorMessage) {
    const query = encodeURIComponent(errorMessage);
    const googleSearchURL = `https://www.google.com/search?q=${query}`;

    const response = await axios.get(googleSearchURL, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const $ = cheerio.load(response.data);
    const solutions = [];

    $('a').each((_, element) => {
        const title = $(element).text().trim();
        const url = $(element).attr('href');

        if (url && title) {
            const cleanUrl = url.startsWith('/url?q=') ? url.split('/url?q=')[1].split('&')[0] : url;
            if (cleanUrl.startsWith('https://') && !cleanUrl.includes('google')) {
                solutions.push({ title, url: cleanUrl });
            }
        }
    });

    return solutions;
}

async function generativeAI(errorMessage){

	const skibidi = 'API_KEY'
	// free shit anyways TODO:prolly change ts
	const genAI = new GoogleGenerativeAI(skibidi);

	const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

	const prompt = errorMessage + ', possible solutions with examples for this?'

	const result = await model.generateContent(prompt);

	const headerRegex = /\*\*(.*?)\*\*/g; 
    const codeBlockRegex = /```([\s\S]*?)```/g;

    let formattedText = result.response.text();

    formattedText = formattedText.replace(codeBlockRegex, match => {
        const code = match.replace(/```(\w+)?|```/g, ""); 
		return `<pre><code>${code}</code></pre>`; 
    });

    formattedText = formattedText.replace(headerRegex, match => {
        const cleanedText = match.replace(/\*\*/g, "");
        return `<h3>${cleanedText}</h3>`;
    });

    return formattedText;

}

function showSolutionsInWebview(solutions, genAiSolution) {
    const panel = vscode.window.createWebviewPanel(
        'errorSolutions',
        'Debug Helper',
        vscode.ViewColumn.One,
        {
            enableScripts: true
        }
    );

	const genAIHTML = ` 
	<div class="solution-card"> 
		<h4>${genAiSolution}</h4> 
	</div> `;

   const solutionHTML = solutions.map(solution => `
		<div class="solution-card">
			<h3>${solution.title}</h3>
			<a href="${solution.url}" target="_blank" class="btn">Open Solution</a>
		</div>
	`).join('');

	panel.webview.html = `
	<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Error Solutions</title>
		<style>
			body {
				font-family: 'Roboto', sans-serif;
				background-color: #e0f2f1;
				color: #333;
				padding: 20px;
			}
			h1 {
				color: #2c3e50;
			}
			.solutions-container {
				display: flex;
				flex-wrap: wrap;
				justify-content: space-around;
				gap: 20px;
			}
			.solution-card {
				background-color: #ffffff;
				border-radius: 12px;
				box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
				padding: 20px;
				transition: transform 0.2s, background-color 0.3s;
				flex: 1 1 calc(50% - 20px);
				box-sizing: border-box;
				display: 'flex';
				flex-direction: 'column';
				justify-content: 'space-between';
			}
			.solution-card:hover {
				transform: translateY(-5px);
				background-color: #f0faf9;
			}
			h3 {
				margin: 0 0 10px 0;
				color: #34495e;
			}
			.btn {
				display: inline-block;
				padding: 10px 15px;
				color: #ffffff;
				background-color: #009688;
				border: none;
				border-radius: 5px;
				text-decoration: none;
				font-weight: bold;
				text-align: center;
				transition: background-color 0.3s;
			}
			.btn:hover {
				background-color: #00796b;
			}
		</style>
	</head>
	<body>
		${genAIHTML}
		<h1>Quick search 🚀</h1>
		<div class="solutions-container">
			${solutionHTML}
		</div>
		<pre> Thanks For Using The Extension </pre>
		<p>
	</body>
	</html>
	`;



}


function deactivate() {}

module.exports = {
	activate,
	deactivate
}
