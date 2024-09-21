// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import sharp from "sharp";

import { ImageFormatTypes, RequestTypes, StatusCodes } from "./enums";
import { Headers, ImageEdits } from "./types";

export interface ImageHandlerEvent {
  path?: string;
  queryStringParameters?: {
    signature: string;
  };
  requestContext?: {
    elb?: unknown;
  };
  headers?: Headers;
}

export interface DefaultImageRequest {
  bucket?: string;
  key: string;
  edits?: ImageEdits;
  tilerParams?: TilerImageRequest;
  outputFormat?: ImageFormatTypes;
  effort?: number;
  headers?: Headers;
}

/*
  Parameters:
  - topLeftLat: number - The latitude of the top left corner of the image
  - topLeftLong: number - The longitude of the top left corner of the image
  - overlayWidthInMeters: number - The width of the overlay in meters
  - rotationDegrees: number - The rotation of the image in degrees
  - x: number - The x coordinate of the tile to be processed
  - y: number - The y coordinate of the tile to be processed
  - zoom: number - The zoom level of the tile to be processed
*/
export interface TilerImageRequest {
  topLeftLat: number;
  topLeftLong: number;
  overlayWidthInMeters: number;
  rotationDegrees: number;
  x: number;
  y: number;
  zoom: number;
}

export interface BoundingBox {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface BoxSize {
  height: number;
  width: number;
}

export interface ImageRequestInfo {
  requestType: RequestTypes;
  bucket: string;
  key: string;
  edits?: ImageEdits;
  tilerParams?: TilerImageRequest;
  originalImage: Buffer;
  headers?: Headers;
  contentType?: string;
  expires?: string;
  lastModified?: string;
  cacheControl?: string;
  outputFormat?: ImageFormatTypes;
  effort?: number;
}

export interface RekognitionCompatibleImage {
  imageBuffer: {
    data: Buffer;
    info: sharp.OutputInfo;
  };
  format: keyof sharp.FormatEnum;
}

export interface ImageHandlerExecutionResult {
  statusCode: StatusCodes;
  isBase64Encoded: boolean;
  headers: Headers;
  body: string;
}
