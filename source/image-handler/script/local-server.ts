// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "fs";

import { handler } from "../index";
import { ImageHandlerEvent, DefaultImageRequest, RequestTypes, TilerImageRequest } from "../lib";

// Express server with a wildcard get route that calls the image handler
import express from 'express';
import { URL } from 'url';

// Arrange
process.env.SOURCE_BUCKETS = "ntmg-media";

const app = express();
const port = 3000;

app.get('*', async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.slice(1); // Remove leading slash
    
    const event: ImageHandlerEvent = {
      path: path
    };

    const result = await handler(event);

    if (result.statusCode === 200) {
      res.writeHead(200, result.headers);
      res.end(Buffer.from(result.body, 'base64'));
    } else {
      res.status(result.statusCode).send(result.body);
    }
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});


const event: ImageHandlerEvent = {
  path: 'eyJidWNrZXQiOiJudG1nLW1lZGlhIiwia2V5IjoiMjVmZWQ4NzUtNjcwZC01OTU4LThhYTEtYzA0Zjc2MTM1Yjc3L3R1dC83MTY5NDhlMi1kNzBmLTQ3NzYtYWUxOS02ZTY5MzIwNGFmZTgucG5nIiwidGlsZXJQYXJhbXMiOnsidG9wTGVmdExhdCI6MjEuMzM0MDExNDU5NzY0OTQ1LCJ0b3BMZWZ0TG9uZyI6LTE1Ny44NjYzMDEwOTM2NzUxNiwib3ZlcmxheVdpZHRoSW5NZXRlcnMiOjE5ODAsInJvdGF0aW9uRGVncmVlcyI6MTQwLCJ4Ijo0MDI1LCJ5IjoyODc5MSwiem9vbSI6MTYsImFzcGVjdFJhdGlvV2lkdGgiOjk0NDksImFzcGVjdFJhdGlvSGVpZ2h0Ijo5NDQ5fX0='
};
