import S3 from "aws-sdk/clients/s3";

import { getOptions } from "../solution-utils/get-options";
import { ImageRequest } from "./image-request";
import { ImageRequestInfo, TilerImageRequest } from "./lib";
import sharp from "sharp";
import { SecretProvider } from "./secret-provider";
import { SecretsManager } from "aws-sdk";

const awsSdkOptions = getOptions();
const s3Client = new S3(awsSdkOptions);
const secretsManagerClient = new SecretsManager(awsSdkOptions);
const secretProvider = new SecretProvider(secretsManagerClient);

const EARTH_RADIUS = 6378137; // Earth's radius in meters
const TILE_SIZE = 256; // Standard tile size in pixels

interface LatLng {
  lat: number;
  lng: number;
}

interface Point {
  x: number;
  y: number;
}

function project(latLng: LatLng): Point {
  const siny = Math.sin((latLng.lat * Math.PI) / 180);
  const sinySafe = Math.min(Math.max(siny, -0.9999), 0.9999);

  return {
    x: TILE_SIZE * (0.5 + latLng.lng / 360),
    y: TILE_SIZE * (0.5 - Math.log((1 + sinySafe) / (1 - sinySafe)) / (4 * Math.PI)),
  };
}

function getTileCoordinate(worldCoordinate: Point, scale: number): Point {
  return {
    x: (worldCoordinate.x * scale) / TILE_SIZE,
    y: (worldCoordinate.y * scale) / TILE_SIZE,
  };
}

function computeOffset(from: LatLng, distance: number, heading: number): LatLng {
  const radius = EARTH_RADIUS;
  const δ = distance / radius; // angular distance in radians
  const θ = (heading * Math.PI) / 180; // heading in radians

  const φ1 = (from.lat * Math.PI) / 180;
  const λ1 = (from.lng * Math.PI) / 180;

  const sinφ1 = Math.sin(φ1),
    cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ),
    cosδ = Math.cos(δ);
  const sinθ = Math.sin(θ),
    cosθ = Math.cos(θ);

  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * cosθ;
  const φ2 = Math.asin(sinφ2);
  const y = sinθ * sinδ * cosφ1;
  const x = cosδ - sinφ1 * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);

  return {
    lat: (φ2 * 180) / Math.PI,
    lng: (λ2 * 180) / Math.PI,
  };
}

function imageSizeAfterRotation(size: [number, number], degrees: number): [number, number] {
  degrees = degrees % 180;
  if (degrees < 0) {
    degrees = 180 + degrees;
  }
  if (degrees >= 90) {
    size = [size[1], size[0]];
    degrees = degrees - 90;
  }
  if (degrees === 0) {
    return size;
  }
  const radians = (degrees * Math.PI) / 180;
  const width = size[0] * Math.cos(radians) + size[1] * Math.sin(radians);
  const height = size[0] * Math.sin(radians) + size[1] * Math.cos(radians);
  return [width, height];
}

export const getTileImage = async (imageRequestInfo: ImageRequestInfo): Promise<sharp.Sharp> => {
  const tilerParams = imageRequestInfo.tilerParams;
  const { x, y, zoom, overlayWidthInMeters, rotationDegrees, topLeftLat, topLeftLong, aspectRatioWidth, aspectRatioHeight, outputDimension } = tilerParams;

  const scale = Math.pow(2, zoom);

  const topLeft: LatLng = { lat: topLeftLat, lng: topLeftLong };
  const topRight = computeOffset(topLeft, overlayWidthInMeters, 90 + rotationDegrees);
  const bottomRight = computeOffset(
    topRight,
    overlayWidthInMeters * (aspectRatioHeight / aspectRatioWidth),
    180 + rotationDegrees
  );
  const bottomLeft = computeOffset(bottomRight, overlayWidthInMeters, 270 + rotationDegrees);

  const topLeftWorld = project(topLeft);
  const topRightWorld = project(topRight);
  const bottomRightWorld = project(bottomRight);
  const bottomLeftWorld = project(bottomLeft);

  const minX = Math.min(topLeftWorld.x, topRightWorld.x, bottomLeftWorld.x, bottomRightWorld.x);
  const minY = Math.min(topLeftWorld.y, topRightWorld.y, bottomLeftWorld.y, bottomRightWorld.y);
  const maxX = Math.max(topLeftWorld.x, topRightWorld.x, bottomLeftWorld.x, bottomRightWorld.x);
  const maxY = Math.max(topLeftWorld.y, topRightWorld.y, bottomLeftWorld.y, bottomRightWorld.y);
  const boundingBoxTopLeft = { x: minX, y: minY };
  const boundingBoxTopRight = { x: maxX, y: minY };
  const boundingBoxBottomLeft = { x: minX, y: maxY };
  const boundingBoxBottomRight = { x: maxX, y: maxY };

  const boundingBoxTopLeftTile = getTileCoordinate(boundingBoxTopLeft, scale);
  const boundingBoxTopRightTile = getTileCoordinate(boundingBoxTopRight, scale);
  const boundingBoxBottomLeftTile = getTileCoordinate(boundingBoxBottomLeft, scale);
  const boundingBoxBottomRightTile = getTileCoordinate(boundingBoxBottomRight, scale);

  const boundingBoxWidthInTiles = boundingBoxTopRightTile.x - boundingBoxTopLeftTile.x;
  const boundingBoxHeightInTiles = boundingBoxBottomLeftTile.y - boundingBoxTopLeftTile.y;

  // Return solid color image if tile is out of bounds
  if (
    x + 1 < boundingBoxTopLeftTile.x ||
    x > boundingBoxBottomRightTile.x ||
    y + 1 < boundingBoxTopLeftTile.y ||
    y > boundingBoxBottomRightTile.y
  ) {
    // Create a 4x4 image with background color
    return sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 63, g: 120, b: 106, alpha: 255 },
      },
    }).png();
  }

  console.time("getOriginalImage()");
  const {originalImage} = await new ImageRequest(s3Client, secretProvider).getOriginalImage(imageRequestInfo.bucket, imageRequestInfo.key);
  console.timeEnd("getOriginalImage()");

  let imageTile = sharp(originalImage);

  if (rotationDegrees !== 0) {
    console.time("rotate()");

    imageTile = await imageTile.rotate(rotationDegrees, {
      background: { r: 63, g: 120, b: 106, alpha: 255 },
    });

    console.timeEnd("rotate()");
  }

  console.time("imageSizeAfterRotation()");

  const [rotatedImageWidth, rotatedImageHeight] = imageSizeAfterRotation([aspectRatioWidth, aspectRatioHeight], rotationDegrees);

  console.timeEnd("imageSizeAfterRotation()");

  console.time("extract()");
  const left = Math.round(Math.max(0, (x - boundingBoxTopLeftTile.x) / boundingBoxWidthInTiles) * rotatedImageWidth);
  const top = Math.round(Math.max(0, (y - boundingBoxTopLeftTile.y) / boundingBoxHeightInTiles) * rotatedImageHeight);
  const right = Math.round(
    Math.min(rotatedImageWidth, ((x + 1 - boundingBoxTopLeftTile.x) / boundingBoxWidthInTiles) * rotatedImageWidth)
  );
  const bottom = Math.round(
    Math.min(rotatedImageHeight, ((y + 1 - boundingBoxTopLeftTile.y) / boundingBoxHeightInTiles) * rotatedImageHeight)
  );

  imageTile = imageTile.extract({
    left: left,
    top: top,
    width: right - left,
    height: bottom - top,
  });

  console.timeEnd("extract()");

  console.time("extend()");

  const leftExtension = Math.round(
    Math.max(0, ((boundingBoxTopLeftTile.x - x) / boundingBoxWidthInTiles) * rotatedImageWidth)
  );
  const topExtension = Math.round(
    Math.max(0, ((boundingBoxTopLeftTile.y - y) / boundingBoxHeightInTiles) * rotatedImageHeight)
  );
  const rightExtension = Math.round(
    Math.max(0, ((x + 1 - boundingBoxTopRightTile.x) / boundingBoxWidthInTiles) * rotatedImageWidth)
  );
  const bottomExtension = Math.round(
    Math.max(0, ((y + 1 - boundingBoxBottomRightTile.y) / boundingBoxHeightInTiles) * rotatedImageHeight)
  );

  if (leftExtension > 0 || topExtension > 0 || rightExtension > 0 || bottomExtension > 0) {
    imageTile = imageTile.extend({
      top: topExtension,
      right: rightExtension,
      bottom: bottomExtension,
      left: leftExtension,
      background: { r: 63, g: 120, b: 106, alpha: 255 },
    });
  }

  console.timeEnd("extend()");

  const outputWidth = outputDimension ?? 256;
  const outputHeight = outputDimension ?? 256;

  if (right - left > outputWidth || bottom - top > outputHeight) {
    console.time("toBuffer()");
    
    const buffer = await imageTile.toBuffer();
    
    console.timeEnd("toBuffer()");

    console.time("resize()");
    const resizedImage = sharp(buffer)
      .resize(outputWidth, outputHeight, {fit: 'fill'})
      .webp({
        nearLossless: true,
        quality: 80,
      });

    console.timeEnd("resize()");

    return resizedImage;
  }

  return imageTile.webp({
    nearLossless: true,
    quality: 80,
  });
};
