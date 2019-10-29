const gulp = require('gulp');
const path = require('path');
const imageProcess = require('./index.js');

gulp.task('images', () => {
  const imageFolder = path.resolve('test', 'resources', 'src', '1.jpg');
  return (
    gulp
      .src(imageFolder)
      .pipe(
        imageProcess({
          quality: 100,
          watermark: {
            filePath: 'test/resources/src/watermark.png',
            position: 'northwest',
            ignoreRatio: true,
            isCover: true,
            sizePattern: 120,
          },
        }),
      )
      .pipe(gulp.dest(path.resolve('test', 'result')))
  );
});
