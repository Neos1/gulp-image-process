const through = require('through2');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const chalk = require('chalk');
const PluginError = require('plugin-error');

const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];

const TASK_NAME = 'gulp-image-process';

const processWatermark = require('./watermark');
const Logger = require('./log');

let logger;
module.exports = function (param) {
  if (!param) {
    throw new PluginError(
      TASK_NAME,
      'Parameters are mandatory. Please read documentation: https://github.com/zekth/gulp-image-process#readme',
    );
  }
  // process.env.IMG_PROCESS_VERBOSE = param.verboseLogging || false
  logger = new Logger(param.verboseLogging);
  logger.verboseLog('Verbose Logging is enabled');

  let parameters = {
    watermark: {
      maxSize: -1,
    },
    width: null,
    height: null,
    ignoreRatio: false,
    progressive: false,
    keepMetadata: false,
    quality: 100,
    multipleResize: false,
    output: false,
  };
  parameters = Object.assign(parameters, param);
  if (parameters.quality > 100) {
    parameters.quality = 100;
  }
  if (parameters.quality < 1) {
    parameters.quality = 1;
  }
  if (parameters.watermark.maxSize > 100) {
    parameters.watermark.maxSize = 100;
  }
  if (parameters.watermark.maxSize < 0) {
    parameters.watermark.maxSize = 0;
  }
  logger.verboseLog(chalk.yellow(`${TASK_NAME} parameters`), parameters);

  const extensionFile = (filePath) => (
    path.extname(filePath).toLowerCase()
  );

  const processMultipleResize = async (file, task) => {
    const p = [];
    const fileInfo = path.parse(file.path);
    if (Array.isArray(parameters.multipleResize)) {
      parameters.multipleResize.forEach((s) => {
        logger.verboseLog(`${chalk.yellow('Multiple Resize')} ${fileInfo.name} Size:${s}`);
        const cFile = file.clone();
        p.push(
          sharp(cFile.contents)
            .resize(s, s, { fit: 'inside', withoutEnlargement: true })
            .toBuffer()
            .then((data) => {
              cFile.contents = data;
              cFile.path = path.resolve(fileInfo.dir, `${fileInfo.name}-${s}${fileInfo.ext}`);
              task.push(cFile);
            }),
        );
      });
    }
    await Promise.all(p);
  };

  async function processFiles(file, enc, cb) {
    const gulpTask = this;
    if (file.isNull()) {
      logger.verboseLog('File is null. Skipping it');
      cb();
      return;
    }
    if (file.isStream()) {
      throw new PluginError(TASK_NAME, 'Streaming not supported');
    }
    if (!supportedExtensions.includes(extensionFile(file.path))) {
      logger.verboseLog('File type is not supported. Skipping it.');
      cb();
      return;
    }
    let img = sharp(file.path);
    if (parameters.keepMetadata) {
      img.withMetadata();
    }
    if (parameters.watermark.filePath) {
      if (!fs.existsSync(parameters.watermark.filePath)) {
        throw new PluginError(TASK_NAME, 'Watermark file not found!');
      }
      img = await processWatermark(img, parameters);
    }
    if (parameters.width || parameters.height) {
      logger.verboseLog(`${chalk.yellow('Resize')} ${parameters.width}x${parameters.height}`);
      img.resize(parameters.width, parameters.height);
    }
    if (!parameters.ignoreRatio) {
      logger.verboseLog(`${chalk.yellow('Resize')} Keeping Image Ratio`);
      img.resize(parameters.width, parameters.height, { fit: 'inside', withoutEnlargement: true });
    }
    let pngCompressionLevel = Number((parameters.quality / 10).toFixed());
    if (pngCompressionLevel > 9) {
      pngCompressionLevel = 9;
    }
    const forceJpg = parameters.output === 'jpeg' || parameters.output === 'jpg';
    if (forceJpg) {
      img.background({ r: 255, g: 255, b: 255 }).flatten()
    }
    img
      .jpeg({ quality: parameters.quality, force: forceJpg, progressive: parameters.progressive })
      .webp({ quality: parameters.quality, force: parameters.output === 'webp' })
      .png({ compressionLevel: pngCompressionLevel, force: parameters.output === 'png' })
      .toBuffer()
      .then(async (data) => {
        const fInfo = path.parse(file.path);
        switch (parameters.output) {
          case 'webp':
            file.path = path.join(fInfo.dir, `${fInfo.name}.webp`);
            break;
          case 'jpeg':
          case 'jpg':
            file.path = path.join(fInfo.dir, `${fInfo.name}.jpeg`);
            break;
          case 'png':
            file.path = path.join(fInfo.dir, `${fInfo.name}.png`);
            break;
          default:
            break;
        }
        file.contents = data;
        if (parameters.multipleResize) {
          logger.verboseLog(`${chalk.yellow('Multiple Resize')} Processing`);
          await processMultipleResize(file, gulpTask);
        }
        gulpTask.push(file);
        cb();
      });
  }
  return through.obj(
    {
      maxConcurrency: 8,
    },
    processFiles,
  );
};
