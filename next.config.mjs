/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ["image/avif", "image/webp"]
  },
  serverExternalPackages: ["nodemailer"],
  outputFileTracingIncludes: {
    "/api/bookings": ["./node_modules/nodemailer/**/*"]
  }
};

export default nextConfig;
