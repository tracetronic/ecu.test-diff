// SPDX-FileCopyrightText: 2025 tracetronic GmbH
//
// SPDX-License-Identifier: MIT

const path = require('path');

const DotenvPlugin = require('dotenv-webpack');
const ESLintPlugin = require('eslint-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env) => {
  return {
    entry: {
      serviceWorker: './src/serviceWorker.ts',
      popup: './src/popup.ts',
      options: './src/options.ts',
    },
    module: {
      rules: [
        {
          test: /\.(js|ts)x?$/,
          use: ['babel-loader'],
          exclude: /node_modules/,
        },
        {
          test: /\.(scss|css)$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, 'dist'),
      clean: true,
    },
    plugins: [
      new DotenvPlugin(),
      new ESLintPlugin({
        extensions: ['js', 'ts'],
        overrideConfigFile: path.resolve(__dirname, '.eslintrc'),
      }),
      new MiniCssExtractPlugin({
        filename: 'styles/[name].css',
      }),
      new CopyPlugin({
        patterns: [
          {
            from: 'static',
            transform: (buffer, filename) => {
              if (path.basename(filename) == 'manifest.json') {
                // we have to set background in manifest.json accourdingly to target browser.
                let content = buffer.toString('utf8');
                const target = env.TARGET ?? ''.toLowerCase();
                if (!['firefox', 'chrome'].includes(target))
                  throw new Error(
                    'Unknown or empty target. Set environment variable TARGET to chrome or firefox!',
                  );
                const pattern = /["']background["']\s*:\s*{\s*}/g;
                content = content.replace(
                  pattern,
                  target == 'chrome'
                    ? '"background": { "service_worker": "serviceWorker.js" }'
                    : '"background": { "scripts": ["serviceWorker.js"] }',
                );

                buffer = Buffer.from(content);
              }
              return buffer;
            },
          },
        ],
      }),
    ],
  };
};
