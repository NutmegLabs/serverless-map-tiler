import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';

const mapId = "c1dc42f3-a6d1-41f6-a6ef-8468d314f019";
let environment = 'development'; // | 'staging' | 'production';

const EARTH_RADIUS = 6378137; // Earth's radius in meters
const TILE_SIZE = 256; // Standard tile size in pixels

interface DigitalMap {
  id: string,
  background: {
    top_left: { latitude: number, longitude: number },
    image_aspect_ratio: { width: number, height: number },
    image_projection_width_in_meters: number,
    image_url: string,
    use_overlay_tiling: boolean
  },
  default_map_zoom: {
    value: number,
  },
  map_rotation: {
    value: number,
  },
}

let tableName: string;
let region: string;

switch (environment) {
  case 'development':
    tableName = 'digital-map-development';
    region = 'us-west-1';
    break;
  case 'staging':
    tableName = 'stg-digital-map';
    region = 'ap-southeast-2';
    break;
  case 'production':
    tableName = 'prod-digital-map';
    region = 'ap-southeast-2';
    break;
  default:
    throw new Error(`Invalid environment: ${environment}`);
}

// Initialize DynamoDB client
const client = new DynamoDB({
  region: region,
});
const dynamoDB = DynamoDBDocument.from(client);

// Load the map from DynamoDB
async function loadMapFromDynamoDB(mapId: string): Promise<DigitalMap> {
  const params = {
    TableName: tableName,
    Key: {
      id: mapId
    }
  };

  try {
    const result = await dynamoDB.get(params);
    return result.Item as DigitalMap;
  } catch (error) {
    console.error('Error loading map from DynamoDB:', error);
    throw error;
  }
}

// Usage example
(async () => {
  try {
    const map: DigitalMap = await loadMapFromDynamoDB(mapId);
    
    console.log('map.background', map.background);
    console.log('map.map_rotation', map.map_rotation);

    const minZoom = Math.floor(map.default_map_zoom?.value ? map.default_map_zoom.value - 2 : 14);

    for (let zoom = minZoom; zoom <= minZoom /* + 5 */; zoom++) {
      console.log(`Processing zoom level ${zoom}`);

      await preloadTiles(map, zoom);
    }

  } catch (error) {
    console.error('Failed to load map:', error);
  }
})();

async function preloadTiles(map: DigitalMap, zoom: number) {
  const { top_left, image_aspect_ratio, image_projection_width_in_meters, image_url, use_overlay_tiling } = map.background;

  const topLeftLat = top_left.latitude;
  const topLeftLong = top_left.longitude;
  const overlayWidthInMeters = image_projection_width_in_meters;
  const rotationDegrees = map.map_rotation?.value || 0;
  const aspectRatioWidth = image_aspect_ratio.width;
  const aspectRatioHeight = image_aspect_ratio.height;

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
  const boundingBoxBottomRight = { x: maxX, y: maxY };

  const boundingBoxTopLeftTile = getTileCoordinate(boundingBoxTopLeft, scale);
  const boundingBoxBottomRightTile = getTileCoordinate(boundingBoxBottomRight, scale);

  const tiles: { x: number, y: number }[] = [];

  for (let x = Math.floor(boundingBoxTopLeftTile.x); x <= Math.ceil(boundingBoxBottomRightTile.x); x++) {
    for (let y = Math.floor(boundingBoxTopLeftTile.y); y <= Math.ceil(boundingBoxBottomRightTile.y); y++) {
      tiles.push({ x, y });
    }
  }

  // Process tiles in batches of 100
  const batchSize = 100;
  for (let i = 0; i < tiles.length; i += batchSize) {
    const batch = tiles.slice(i, i + batchSize);

    console.log(`Processing batch (${i}-${Math.min(i + batchSize - 1, tiles.length - 1)}) of ${tiles.length}`);

    await processTiles(batch, map, zoom);
  }
}

interface ImageRequest {
  bucket: string;
  key: string;
  tilerParams: {
    topLeftLat: number;
    topLeftLong: number;
    overlayWidthInMeters: number;
    rotationDegrees: number;
    x: number;
    y: number;
    zoom: number;
    aspectRatioWidth: number;
    aspectRatioHeight: number;
  };
}

const cloudfrontHostname = 'https://d1pjfltiy06or1.cloudfront.net/';
const s3Hostname = 'ntmg-media.s3.us-west-1.amazonaws.com';
const s3BucketName = 'ntmg-media';

async function processTiles(tiles: { x: number, y: number }[], map: DigitalMap, zoom: number) {
  const originalImageUrl = map.background.image_url;

  const tileUrls = tiles.map(tile => {
  const parts = originalImageUrl.split(s3Hostname + '/');
  if (parts.length !== 2) {
    return originalImageUrl;
  }

  const key = parts[1]
    .split('/')
    .map((pathPart) => decodeURIComponent(pathPart))
    .join('/');

  const imageRequest: ImageRequest = {
    bucket: s3BucketName,
    key,
    tilerParams: {
      topLeftLat: map.background.top_left.latitude,
      topLeftLong: map.background.top_left.longitude,
      overlayWidthInMeters: map.background.image_projection_width_in_meters || 0,
      rotationDegrees: map.map_rotation?.value || 0,
      x: tile.x,
      y: tile.y,
      zoom: zoom,
      aspectRatioWidth: map.background.image_aspect_ratio.width,
      aspectRatioHeight: map.background.image_aspect_ratio.height,
    },
  };

  // Encode the imageRequest to base64
  const base64ImageRequest = Buffer.from(JSON.stringify(imageRequest)).toString('base64');
  return `${cloudfrontHostname}/${base64ImageRequest}`;
  });

  const promises: Promise<any>[] = [];
  for (const tileUrl of tileUrls) {
    console.log(`Downloading ${tileUrl}`);
    // Download the image
    promises.push(fetch(tileUrl));
  }

  await Promise.all(promises);
}

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
