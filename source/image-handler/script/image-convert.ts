import sharp from 'sharp';
import fs from 'fs';
const imageUrl = 'https://ntmg-media.s3.us-west-1.amazonaws.com/25fed875-670d-5958-8aa1-c04f76135b77/tut/5a26e471-90fd-42bd-9abf-ca4acb4c556e.svg';

async function run() {
const image = await fetch(imageUrl);
const imageBuffer = await image.arrayBuffer();

const sharpImage = sharp(imageBuffer, {
    density: 800,
});

// Convert SVG to PNG and save to file
const pngBuffer = await sharpImage.png({
    quality: 100,
    palette: true,
}).toBuffer();
fs.writeFileSync('output.png', pngBuffer);

console.log(imageBuffer);
}

run();
