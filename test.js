const buffer = new Uint8Array([1, 2, 3]);
const base64 = btoa(String.fromCharCode(...buffer));
console.log(base64);
