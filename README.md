# EONPRO Telehealth Platform

A HIPAA-compliant telehealth platform built with Next.js, providing secure virtual healthcare services.

## 🚀 Features

- **HIPAA Compliant**: Full PHI encryption, audit logging, and security measures
- **Role-Based Access**: Admin, Provider, Staff, Support, and Patient portals
- **Telehealth**: Video consultations and virtual appointments
- **Clinical Tools**: SOAP notes, prescriptions, lab results
- **Patient Management**: Intake forms, documents, billing
- **Secure Messaging**: Internal chat and support system
- **2FA Authentication**: Enhanced security for providers
- **Multi-Clinic Support**: Manage multiple locations

## 🛠️ Tech Stack

- **Frontend**: Next.js 16, React 18, TypeScript
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL (production), SQLite (development)
- **Authentication**: NextAuth.js with JWT
- **Styling**: Tailwind CSS
- **Security**: AES-256-GCM encryption, bcrypt
- **Deployment**: Vercel, Docker support

## 📋 Prerequisites

- Node.js 20+
- PostgreSQL 14+ (for production)
- npm or yarn

## 🔧 Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/eonpro.git
cd eonpro
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.example .env.local
# Edit .env.local with your configuration
```

4. Set up the database:
```bash
npx prisma migrate dev
npx prisma db seed
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) to view the application.

## 🔐 Security Configuration

Generate secure keys for production:
```bash
openssl rand -hex 32  # ENCRYPTION_KEY
openssl rand -base64 32  # JWT_SECRET
```

## 📦 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Docker

```bash
docker-compose -f docker-compose.staging.yml up -d
```

## 📝 Environment Variables

Key environment variables needed:

- `DATABASE_URL` - PostgreSQL connection string
- `ENCRYPTION_KEY` - PHI encryption key
- `JWT_SECRET` - JWT signing secret
- `NEXTAUTH_URL` - Application URL
- `SENDGRID_API_KEY` - Email service

See `env.example` for complete list.

## 🧪 Testing

```bash
npm run test
npm run security:audit
```

## 📚 Documentation

- [Deployment Guide](./DEPLOYMENT.md)
- [Security Documentation](./SECURITY.md)
- [API Documentation](./docs/API.md)
- [Legal Templates](./LEGAL_TEMPLATES.md)

## 🤝 Contributing

Please read our contributing guidelines before submitting PRs.

## 📄 License

Proprietary - All Rights Reserved

## 🆘 Support

For support, email support@eonpro.health

## 🔒 HIPAA Compliance

This platform implements HIPAA security requirements including:
- Encryption at rest and in transit
- Access controls and audit logging
- Automatic session timeout
- Business Associate Agreements
- Data backup and recovery

---

Built with ❤️ for modern healthcare