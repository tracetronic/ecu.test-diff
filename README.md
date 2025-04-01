<!--
SPDX-FileCopyrightText: 2025 tracetronic GmbH

SPDX-License-Identifier: MIT
-->

![ecu.test Diff Extension](https://blubb.png)

Browser plugin to open the diff viewer of tracetronic products ecu.test and trace.check from browser.

## Announcements

*Nothing to see here yet.*

## Features

ecu.test Diff Extension is a bridge between the current browser tab and an installed ecu.test. It allows you to diff packages (`.pkg`) and other artifacts 
from an open commit or merge request with only a few simple clicks.

SCM platforms:
- Github
- Gitlab

Supported entry points
- Single commits
- Merges 

Detected file extensions
- `.pkg`
- `.prj`
- `.trf` (view only, no diff)

## Getting started

### Installing and running

TODO: The extention is not yet released on chrome or firefox app stores!

Use the extention in development mode (this mode is probably forbidden via company IT rules!):

**Firefox**
    
    1. Download the relevant .xpi file from releases.
    2. Go to `about:debugging#/runtime/this-firefox`
    3. Click on load temporary addon select the .xpi file.
**Chrome/Edge**

    1. Download the relevant .crx file from releases.
    2. Go to `chrome://extensions/`
    3. Enable development mode
    4. Drag .crx into the window (if it is not working, reload window once)

You are good to go! You can also pin the extension to the toolbar for easy access.

### Usage
- Open a commit or merge request on your SCM platform. Open the extention popup dialog.
- Select the correct platform type and add the host.
- Go to the options. E.g., via click on the cog wheel icon.
- Now enter you API token. Don't give the token all permissions! Only reading repository and API access. So create fine-grained tokens!
- Save the settings
- Go back to the commit page and open the popup again.
- The supported files of the changes will be listed.
- Click on a file and click on "Show diff".
- ecu.test Diff-Viewer will be opened. This needs ecu.test installed and a valid license available!

### Developer Guide
#### Install node.js
First you have to install [node.js](https://nodejs.org/en/download) to have access to the package manager npm for building the browser extension.
#### Install dependencies
Open the ecu.test diff project in your IDE of choice and run the following terminal command to install the dependencies including typescript:

```npm install -g typescript```

#### Build process
If you want to build the ecu.test diff extension locally for development purpose or for production use, you have access to different scripts:

**<u>Note:</u>** All of these scripts can be found and modified within the './package.json' of the project.

**Firefox:**
```
npm run start-firefox
npm run build-firefox
```
**Chrome/Edge:**
```
npm run start-chrome
npm run build-chrome
```
Your compiles files are available inside the './dist' folder after the build process.
For integration and testing into you browser you have to note some differences:

In Chrome/Edge you can just select the './dist' folder inside you browser windows for importing the extension.

In Firefox you can test the extension only in debug-mode. You have to klick on 'debug add-ons' and can afterwards select a .zip file for the import. You can create the .zip file on your own or use the tool web-ext (from mozilla). 
```
npm install web-ext
cd ./dist
web-ext build
```
This tooling also provide a help in the ['signing' process](https://extensionworkshop.com/documentation/develop/extensions-and-the-add-on-id/) which is required for the use of add-ons without debug-mode in firefox.

#### Testing / Linting / Code formatting
For these purposes there are three additional scripts which execute the local tests, start the linter in the source code and do some code formatting:

```
npm run test
npm run lint
npm run prettier
```

#### Open-Source Software compliance
To ensure open-source complience with our provided software at tracetronic GmbH we use the tool [reuse](https://reuse.readthedocs.io/en/stable/readme.html). After installing the tooling in your local environment you can check for open-source compliance with:

```reuse lint```

If you want to add the SPDX-Headers automatically - in case there are a lot of files - you can do this with the following:

```reuse annotate --copyright="tracetronic GmbH" --license=MIT -r <your_folder>/ ./<your_file>.ts```

### Licensing
This work is licensed under MIT license. This project is based on the boilerplate [Chrome Extension Webpack](https://github.com/sszczep/chrome-extension-webpack).

