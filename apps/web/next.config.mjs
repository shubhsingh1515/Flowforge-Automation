/** @type {import('next').NextConfig} */
const rawApiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const baseApiUrl = rawApiUrl.replace(/\/api\/v1\/?$/, "");

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@flowforge/shared"],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${baseApiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
