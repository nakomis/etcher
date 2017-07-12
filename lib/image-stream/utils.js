/*
 * Copyright 2016 resin.io
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const _ = require('lodash');
const Bluebird = require('bluebird');
const fileType = require('file-type');
const mime = require('mime-types');
const fs = Bluebird.promisifyAll(require('fs'));
const errors = require('../shared/errors');

/**
 * @summary Read a buffer from an image file descriptor
 * @function
 * @private
 *
 * @param {Number} fileDescriptor - file descriptor
 * @param {Number} count - number of bytes to read
 * @param {Number} offset - image offset to start reading from
 * @fulfil {Buffer} - buffer
 * @returns {Promise}
 *
 * @example
 * fs.openAsync('path/to/image.img', 'r').then((fileDescriptor) => {
 *   return utils.readBufferFromImageFileDescriptor(fileDescriptor, 512, 0);
 * }).then((buffer) => {
 *   console.log(buffer);
 * });
 */
exports.readBufferFromImageFileDescriptor = (fileDescriptor, count, offset) => {
  const BUFFER_FILL_VALUE = 0;
  const BUFFER_START_OFFSET = 0;
  const buffer = Buffer.alloc(count, BUFFER_FILL_VALUE);

  return fs.readAsync(fileDescriptor, buffer, BUFFER_START_OFFSET, count, offset).tap((bytesRead) => {
    if (bytesRead !== count) {
      throw errors.createUserError({
        title: 'Looks like the image is truncated',
        description: `We tried to read ${count} bytes at ${offset}, but got ${bytesRead} bytes instead`
      });
    }
  }).return(buffer);
};

/**
 * @summary Get archive mime type
 * @function
 * @public
 *
 * @param {String} filename - file path
 * @fulfil {String} - mime type
 * @returns {Promise}
 *
 * @example
 * utils.getArchiveMimeType('path/to/raspberrypi.img.gz').then((mimeType) => {
 *   console.log(mimeType);
 * });
 */
exports.getArchiveMimeType = (filename) => {
  const MIME_TYPE_RAW_IMAGE = 'application/octet-stream';
  const mimeType = mime.lookup(filename);

  if (mimeType) {
    return Bluebird.resolve(mimeType);
  }

  const FILE_TYPE_ID_START = 0;
  const FILE_TYPE_ID_BYTES = 262;

  return Bluebird.using(fs.openAsync(filename, 'r').disposer((fileDescriptor) => {
    return fs.closeAsync(fileDescriptor);
  }), (fileDescriptor) => {
    return exports.readBufferFromImageFileDescriptor(fileDescriptor, FILE_TYPE_ID_BYTES, FILE_TYPE_ID_START).then((buffer) => {
      return _.get(fileType(buffer), [ 'mime' ], MIME_TYPE_RAW_IMAGE);
    });
  });
};

/**
 * @summary Extract the data of a readable stream
 * @function
 * @public
 *
 * @description
 * You should be careful when using this function, since you can only
 * extract files that are not bigger than the available computer memory.
 *
 * @param {StreamReadable} stream - stream
 * @fulfil {Buffer} - data
 * @returns {Promise}
 *
 * @example
 * const stream = fs.createReadStream('./foo/bar');
 *
 * utils.extractStream(stream).then((data) => {
 *   console.log(data.toString());
 * });
 */
exports.extractStream = (stream) => {
  return new Bluebird((resolve, reject) => {
    const chunks = [];

    stream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    stream.on('error', reject);
    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
};
