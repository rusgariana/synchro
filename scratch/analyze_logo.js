
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

async function findTextBounds() {
    const img = await loadImage('/Users/anastasia/Downloads/meetpoint-main/public/logo_transparent.png');
    console.log(`Image size: ${img.width}x${img.height}`);
    
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, img.width, img.height).data;
    
    // Scan for all non-transparent areas
    let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
    
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const alpha = imageData[(y * img.width + x) * 4 + 3];
            if (alpha > 50) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    
    console.log(`Overall bounding box: x=${minX}, y=${minY}, width=${maxX-minX}, height=${maxY-minY}`);
}

findTextBounds().catch(console.error);
