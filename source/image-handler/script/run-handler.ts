// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "fs";

import { handler } from "../index";
import { ImageHandlerEvent, DefaultImageRequest, RequestTypes, TilerImageRequest } from "../lib";

// {"bucket":"ntmg-media","key":"25fed875-670d-5958-8aa1-c04f76135b77/tut/cfb18865-ea6c-4924-a36f-58bc1f7d8ed1.png","tilerParams":{"topLeftLat":21.334011459764945,"topLeftLong":-157.86630109367516,"overlayWidthInMeters":2800,"rotationDegrees":136,"x":1006,"y":7197,"zoom":14,"aspectRatioWidth":3521,"aspectRatioHeight":2368}}
/*const imageRequest: DefaultImageRequest = {
  bucket: "ntmg-media",
  key: "25fed875-670d-5958-8aa1-c04f76135b77/tut/cfb18865-ea6c-4924-a36f-58bc1f7d8ed1.png",
  tilerParams: {
    topLeftLat: 21.334011459764945,
    topLeftLong: -157.86630109367516,
    overlayWidthInMeters: 2800,
    rotationDegrees: 136,
    x: 1006,
    y: 7197,
    zoom: 14,
    aspectRatioWidth: 3521,
    aspectRatioHeight: 2368
  },
}
const imageRequest: DefaultImageRequest = {
  bucket: "ntmg-media",
  key: "25fed875-670d-5958-8aa1-c04f76135b77/tut/5a26e471-90fd-42bd-9abf-ca4acb4c556e.svg",
  tilerParams: {
    topLeftLat: 21.330218226508233,
    topLeftLong: -157.86294656435823,
    overlayWidthInMeters: 2800,
    rotationDegrees: 136,
    x: 4025,
    y: 28792,
    zoom: 16,
    aspectRatioWidth: 150,
    aspectRatioHeight: 150
  },
}

const buf = Buffer.from(JSON.stringify(imageRequest));
const base64EncodedImageRequest = buf.toString('base64');
*/

// Arrange
process.env.SOURCE_BUCKETS = "ntmg-media";
const event: ImageHandlerEvent = {
  path: 'eyJidWNrZXQiOiJudG1nLW1lZGlhIiwia2V5IjoiZmQ5ZmQ0ZjUtZjQ5ZC01M2M2LTk4MjEtZmIxY2NmNmM5MGVhL3R1dC9jODI0NTMwOC1kZTAzLTQ0ZWQtYTEzOS1kNzIwNGI1NDAwZjEucG5nIiwidGlsZXJQYXJhbXMiOnsidG9wTGVmdExhdCI6MjguNjQyODM2MjkyMjM5MzA2LCJ0b3BMZWZ0TG9uZyI6LTgxLjczNDk2MDcyOTgyNDgyLCJvdmVybGF5V2lkdGhJbk1ldGVycyI6NjAwMDAsInJvdGF0aW9uRGVncmVlcyI6MCwieCI6NDQ4MiwieSI6NjgzOCwiem9vbSI6MTQsImFzcGVjdFJhdGlvV2lkdGgiOjE2Mzg0LCJhc3BlY3RSYXRpb0hlaWdodCI6OTIxNn19'
};

async function run() {
    let startTime = Date.now();
    const result = await handler(event);

    console.log(`handler(): ${Date.now() - startTime}ms`);

    startTime = Date.now();
    // Write the result to an image file
    if (result.statusCode === 200) {
      switch (result.headers["Content-Type"]) {
        case "image/png":
          fs.writeFileSync("result.png", Buffer.from(result.body, 'base64'));
          break;
        case "image/jpeg":
          fs.writeFileSync("result.jpg", Buffer.from(result.body, 'base64'));
          break;
        default:
        throw new Error(`Unsupported image format: ${result.headers["Content-Type"]}`);
    }
    
    console.log(`writeFileSync(): ${Date.now() - startTime}ms`);

  }
}

run();