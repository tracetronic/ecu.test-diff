# ecu.test diff extension developer documentation
### Description

Please have a look at section 'Description' inside [README.md](..\README.md 'Description').

### Features
Please have a look at section 'Features' inside [README.md](..\README.md 'Features').

### Fork information
This project is based on the boilerplate [Chrome Extension Webpack](https://github.com/sszczep/chrome-extension-webpack) from Sebastian Szczepański.

### Prerequisites
#### Install node.js
First you have to install [node.js](https://nodejs.org/en/download) to have access to the package manager npm for building the browser extension.

### Development Setup
#### Install dependencies
Open the ecu.test diff project in your IDE of choice and run the following terminal command to install the dependencies including typescript:

```npm install -g typescript```

### Build process
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

### Testing / Linting / Code formatting
For these purposes there are three additional scripts which execute the local tests, start the linter in the source code and do some code formatting:

#### Prettier
Prettier is a code formatter that enforces a consistent style by parsing your code and re-printing it.

```bash
npm run prettier
```

#### Linting
Use the internal npm linter with the follwing command:

```bash
npm run lint
```

#### Testing
Your definded tests can be run with the command blow. The command runs all tests definded in the root 'test' folder and generates a coverage report.

```bash
npm run test
```

### Open-Source Software compliance
#### reuse
To ensure open-source complience with our provided software at tracetronic GmbH we use the tool [reuse](https://reuse.readthedocs.io/en/stable/readme.html). After installing the tooling in your local environment you can check for open-source compliance with:

```reuse lint```

If you want to add the SPDX-Headers automatically - in case there are a lot of files - you can do this with the following:

```reuse annotate --copyright="tracetronic GmbH" --license=MIT -r <your_folder>/ ./<your_file>.ts```

#### Licensing
This work is licensed under MIT license. You can find the original license text from the [forked](#fork-information) project inside [LICENSE.original](../LICENSE.original).

#### Cyclonedx

To generate a software bill of material (sbom) for the project, run from your terminal root folder:
```bash
#skip if you have cyclonedx already installed globally
npm install --global @cyclonedx/cyclonedx-npm

cyclonedx-npm --output-format json --output-file bom.json

#uninstall cyclonedx if desired
npm uninstall --global @cyclonedx/cyclonedx-npm
```
The generated sbom destination is ./bom.json.
