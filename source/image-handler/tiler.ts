import { TilerImageRequest } from "./lib";
import sharp from "sharp";

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

export const getTileImage = async (originalImage: Buffer, tilerParams: TilerImageRequest): Promise<sharp.Sharp> => {
  let startTime = Date.now();

  const { x, y, zoom, overlayWidthInMeters, rotationDegrees, topLeftLat, topLeftLong, aspectRatioWidth, aspectRatioHeight } = tilerParams;

  const scale = Math.pow(2, zoom);

  const rawImage = sharp(originalImage);
  console.log(`sharp(): ${Date.now() - startTime}ms`);

  startTime = Date.now();

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

  // Return white image if tile is out of bounds
  if (
    x + 1 < boundingBoxTopLeftTile.x ||
    x > boundingBoxBottomRightTile.x ||
    y + 1 < boundingBoxTopLeftTile.y ||
    y > boundingBoxBottomRightTile.y
  ) {
    return sharp();
  }

  console.log(`math: ${Date.now() - startTime}ms`);

  startTime = Date.now();

  let imageTile = await rawImage.rotate(rotationDegrees, {
    background: { r: 63, g: 120, b: 106, alpha: 255 },
  });

  console.log(`rotate(): ${Date.now() - startTime}ms`);

  startTime = Date.now();

  const {info} = await imageTile.toBuffer({resolveWithObject: true});
  const rotatedImageWidth = info.width;
  const rotatedImageHeight = info.height;

  console.log(`toBuffer(): ${Date.now() - startTime}ms`);

  startTime = Date.now();

  const left = Math.round(Math.max(0, (x - boundingBoxTopLeftTile.x) / boundingBoxWidthInTiles) * rotatedImageWidth);
  const top = Math.round(Math.max(0, (y - boundingBoxTopLeftTile.y) / boundingBoxHeightInTiles) * rotatedImageHeight);
  const right = Math.round(
    Math.min(rotatedImageWidth, ((x + 1 - boundingBoxTopLeftTile.x) / boundingBoxWidthInTiles) * rotatedImageWidth)
  );
  const bottom = Math.round(
    Math.min(rotatedImageHeight, ((y + 1 - boundingBoxTopLeftTile.y) / boundingBoxHeightInTiles) * rotatedImageHeight)
  );

  imageTile = await imageTile.extract({
    left: left,
    top: top,
    width: right - left,
    height: bottom - top,
  });

  console.log(`extract(): ${Date.now() - startTime}ms`);

  startTime = Date.now();

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
    imageTile = await imageTile.extend({
      top: topExtension,
      right: rightExtension,
      bottom: bottomExtension,
      left: leftExtension,
      background: { r: 63, g: 120, b: 106, alpha: 255 },
    });
  }

  console.log(`extend(): ${Date.now() - startTime}ms`);

  startTime = Date.now();

  if (right - left > 256 || bottom - top > 256) {
    const buf = await imageTile.toBuffer();
    const resizedImage = await sharp(buf).resize(256, 256, {fit: 'fill'})

    console.log(`resize(): ${Date.now() - startTime}ms`);
    return resizedImage;
  }

  return imageTile;
};
