const sharp = require('sharp');
const chalk = require('chalk');
const Logger = require('./log');

let logger;
const WATERMARK_POSITION = {
  center: 'center',
  north: 'north',
  south: 'south',
  west: 'west',
  east: 'east',
  northwest: 'northwest',
  northeast: 'northeast',
  southwest: 'southwest',
  southeast: 'southeast',
};

module.exports = async (image, parameters) => {
  logger = new Logger(parameters.verboseLogging);
  let imageMetadata;
  let watermarkMetadata;
  let waterMark = await sharp(parameters.watermark.filePath);
  watermarkMetadata = await waterMark.metadata();

  const getRatio = (maxSize, actualSize) => {
    const ratio = (maxSize / actualSize).toFixed(2);
    logger.verboseLog(`${chalk.yellow('Watermark')} resize with ratio:${ratio}`);
    return ratio;
  };

  const getMaxSize = (imageSize, watermarkPercentSize) => {
    const maxSize = Math.round(imageSize * (watermarkPercentSize / 100));
    logger.verboseLog(
      `${chalk.yellow(
        'Watermark',
      )} imagePxSize:${imageSize} watermarkPercentSize:${watermarkPercentSize} maxPxSize:${maxSize}`,
    );
    return maxSize;
  };

  const processWatermarkResize = (watermark, size) => {
    const maxWidth = getMaxSize(imageMetadata.width, size);
    const maxHeight = getMaxSize(imageMetadata.height, size);
    logger.verboseLog(
      `${chalk.yellow('Watermark')} size: max Percent:${size}% width:${watermarkMetadata.width} height:${
        watermarkMetadata.height
      }`,
    );
    if (parameters.watermark.isCover === true) {
      if (!parameters.watermark.sizePattern) {
        throw new Error('Watermark sizePattern not found!');
      }
      let { sizePattern } = parameters.watermark;
      if (sizePattern > maxHeight) sizePattern = maxHeight;
      if (sizePattern > maxWidth) sizePattern = maxWidth;
      waterMark.resize(
        sizePattern,
        sizePattern,
        {
          fit: 'cover',
          position: 'left top',
          withoutEnlargement: true,
        },
      );
      return waterMark;
    }
    // calculate the max difference between watermark and image to choose which between
    // height and width to calculate the resize ratio
    const heightDiff = watermarkMetadata.height - imageMetadata.height;
    const widthDiff = watermarkMetadata.width - imageMetadata.width;
    logger.verboseLog(`${chalk.yellow('Watermark')} heightDiff:${heightDiff} widthDiff:${widthDiff}`);
    const widthIsMax = widthDiff > heightDiff;
    if (widthIsMax) {
      if (watermarkMetadata.width > maxWidth) {
        watermark.resize(
          Math.round(
            getRatio(maxWidth, watermarkMetadata.width) * watermarkMetadata.width,
          ),
          null,
        );
      }
    } else if (watermarkMetadata.height > maxHeight) {
      watermark.resize(
        null,
        Math.round(
          getRatio(maxHeight, watermarkMetadata.height) * watermarkMetadata.height,
        ),
      );
    }
    return waterMark;
  };

  const getCompositeCoordinates = (watermarkPosition, margin = 0) => {
    let xComposite;
    let yComposite;
    const xOffset = watermarkMetadata.width / 2;
    const yOffset = watermarkMetadata.height / 2;

    switch (watermarkPosition) {
      case WATERMARK_POSITION.south:
        xComposite = imageMetadata.width / 2 - xOffset;
        yComposite = imageMetadata.height - watermarkMetadata.height - margin;
        break;
      case WATERMARK_POSITION.north:
        xComposite = imageMetadata.width / 2 - xOffset;
        yComposite = 0 + margin;
        break;
      case WATERMARK_POSITION.center:
        xComposite = imageMetadata.width / 2 - xOffset;
        yComposite = imageMetadata.height / 2 - yOffset;
        break;
      case WATERMARK_POSITION.northwest:
        xComposite = 0 + margin;
        yComposite = 0 + margin;
        break;
      case WATERMARK_POSITION.west:
        xComposite = 0 + margin;
        yComposite = imageMetadata.height / 2 - yOffset;
        break;
      case WATERMARK_POSITION.southwest:
        xComposite = 0 + margin;
        yComposite = imageMetadata.height - watermarkMetadata.height - margin;
        break;
      case WATERMARK_POSITION.northeast:
        yComposite = 0 + margin;
        xComposite = imageMetadata.width - watermarkMetadata.width - margin;
        break;
      case WATERMARK_POSITION.east:
        yComposite = imageMetadata.height / 2 - yOffset;
        xComposite = imageMetadata.width - watermarkMetadata.width - margin;
        break;
      case WATERMARK_POSITION.southeast:
        yComposite = imageMetadata.height - watermarkMetadata.height - margin;
        xComposite = imageMetadata.width - watermarkMetadata.width - margin;
        break;
      default:
        throw new Error('Unknown Position');
    }
    xComposite = Math.round(xComposite);
    if (xComposite < 0) {
      xComposite = 0;
    }
    yComposite = Math.round(yComposite);
    if (yComposite < 0) {
      yComposite = 0;
    }
    return [xComposite, yComposite];
  };

  imageMetadata = await image.metadata();
  const needResize = imageMetadata.width < watermarkMetadata.width
    || imageMetadata.height < watermarkMetadata.height;
  if (needResize || parameters.watermark.maxSize !== -1) {
    let size = 100;
    if (parameters.watermark.maxSize && parameters.watermark.maxSize !== -1) {
      size = parameters.watermark.maxSize;
    }
    waterMark = processWatermarkResize(waterMark, size);
  }
  watermarkMetadata = await sharp(
    await waterMark.toBuffer(),
  ).metadata();
  const waterMarkCoordinates = getCompositeCoordinates(
    parameters.watermark.position,
    parameters.watermark.margin,
  );
  logger.verboseLog(
    `${chalk.yellow('Watermark')} xComposite:${waterMarkCoordinates[0]}, yComposite:${waterMarkCoordinates[1]}`,
  );
  image.composite([
    {
      input: await waterMark.toBuffer(),
      left: waterMarkCoordinates[0],
      top: waterMarkCoordinates[1],
      tile: parameters.watermark.isCover,
    },
  ]);
  return sharp(await image.toBuffer());
};
