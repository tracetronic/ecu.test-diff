# ecu.test diff extension developer documentation <!-- omit in toc -->

- [Description](#description)
- [Features](#features)
- [Fork information](#fork-information)
- [Prerequisites](#prerequisites)
  - [Install node.js](#install-nodejs)
- [Development Setup](#development-setup)
  - [Install dependencies](#install-dependencies)
- [Build process](#build-process)
- [Integration](#integration)
- [Testing / Linting / Code formatting](#testing--linting--code-formatting)
  - [Prettier](#prettier)
  - [Linting](#linting)
  - [Testing](#testing)
- [CI Integration](#ci-integration)
- [Open-Source Software compliance](#open-source-software-compliance)
  - [reuse](#reuse)
  - [Licensing](#licensing)
  - [Cyclonedx](#cyclonedx)

## Description

Please have a look at section 'Description' inside [README.md](../README.md#description).

## Features

Please have a look at section 'Features' inside [README.md](../README.md#features).

## Fork information

This project is based on the boilerplate [Chrome Extension Webpack](https://github.com/sszczep/chrome-extension-webpack) from Sebastian Szczepański.

## Prerequisites

### Install node.js

First, you have to install [node.js](https://nodejs.org/en/download) to have access to the package manager npm for building the browser extension.

## Development Setup

### Install dependencies

Open the ecu.test diff project in your IDE of choice and run the following terminal command to install the dependencies including typescript:

`npm install -g typescript`

## Build process

If you want to build the ecu.test diff extension locally for development purposes or for production use, you have access to different scripts:

**<u>Note:</u>** All of these scripts can be found and modified within the './package.json' of the project.

**Firefox:**

```
npm run start:firefox
npm run build:firefox
```

**Chrome/Edge:**

```
npm run start:chrome
npm run build:chrome
```

Your compiled files are available inside the `./dist` folder after the build process.
**<u>Note:</u>** Since the build folder is `./dist`, only the last build execution is present.

## Integration

For integration and testing into your browser, you have to note some differences:

In **Chrome/Edge** you can select the `./dist` folder inside you browser windows for importing the extension.

In **Firefox**, you can test the extension only in debug-mode.
You have to klick on 'debug add-ons' and can afterward select a .zip file for the import.
You can create the .zip file on your own or use the tool web-ext (from mozilla).

```
npm install web-ext
cd ./dist
web-ext build
```

This tooling also provides help in the [signing process](https://extensionworkshop.com/documentation/develop/extensions-and-the-add-on-id/)
which is required for the use of add-ons without a debug-mode in firefox.

## Testing / Linting / Code formatting

For these purposes, there are three additional scripts that execute the local tests, start the linter in the source code and do some code formatting:

### Prettier

Prettier is a code formatter that enforces a consistent style by parsing your code and re-printing it.
Select the files you want to format and run the following command:

```bash
# check all files
npm prettier:check

# fix findings for all files
npm run prettier:write .

# fix finding for specific files
npm run prettier:write ./<your_file>
```

### Linting

Use the internal npm linter with the following command:

```bash
npm run lint
```

### Testing

Your defined tests can be run with the command blow.
The command runs all tests defined in the root 'test' folder and generates a coverage report.

```bash
npm run test
```

## CI Integration

All CI workflows are located in `.github/workflows`

| name                                      | on                                                                                                                                      | output      | artifacts                |
| :---------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- | :---------- | :----------------------- |
| [deploy](../.github/workflows/deploy.yml) | tag                                                                                                                                     | -           | -                        |
| [build](../.github/workflows/build.yml)   | <ul><li>push and pr to `main`</li><li>workflow dispatch</li><li>reused by [deploy](../.github/workflows/deploy.yml) workflow </li></ul> | -           | chrome and firefox build |
| [test](../.github/workflows/test.yml)     | reused by [build](../.github/workflows/build.yml) workflow                                                                              | test result | -                        |
| [reuse](../.github/workflows/reuse.yml)   | <ul><li>push and pr to `main`</li><li>workflow dispatch</li></ul>                                                                       | spdx sbom   | sbom.spdx                |

Those workflows are running automatically after having some changes to the remote repository.

- `build`
  - provides its artifacts additionally after each execution
    - firefox
    - chrome
- `deploy`
  - Chrome
    - a Google Chrome developer account is required
    - any secrets that are necessary for the publication process are set as `Actions secret`
    - any additional information, see [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
    - after publishing the application, a review is mostly outstanding and has to be published
      manually afterward
    - to automatically publish an application after the review, check "Publish '<application name>'
      automatically after it has passed review" when submitting to review

## Open-Source Software compliance

### reuse

To ensure open-source difference with our provided software at tracetronic GmbH,
we use the tool [reuse](https://reuse.readthedocs.io/en/stable/readme.html).
After installing the tooling in your local environment, you can check for open-source compliance with:

`reuse lint`

If you want to add the SPDX-Headers automatically - in case there are a lot of files - you can do this with the following:

`reuse annotate --copyright="tracetronic GmbH" --license=MIT -r <your_folder>/ ./<your_file>.ts`

### Licensing

This work is licensed under MIT license. You can find the original license text from the [forked](#fork-information) project inside [LICENSE.original](../LICENSE.original).

### Cyclonedx

To generate a software bill of material (sbom) for the project, run from your terminal root folder:

```bash
#skip if you have cyclonedx already installed globally
npm install --global @cyclonedx/cyclonedx-npm

cyclonedx-npm --output-format json --output-file bom.json

#uninstall cyclonedx if desired
npm uninstall --global @cyclonedx/cyclonedx-npm
```

The generated sbom destination is ./bom.json.
