# Configuration Setup Guide

This guide explains how to set up environment variables and configuration for the IT Asset Management System.

## ⚠️ IMPORTANT SECURITY NOTICE

**NEVER commit `.env` files or any files containing sensitive information to version control!**

All `.env` files are ignored by `.gitignore` to prevent accidental commits of sensitive data.

## Backend Configuration

### 1. Create `.env` file in `/backend` directory

Copy the template below and fill in your actual values:

```bash
# Database Configuration
MONGO_URI=your_mongodb_connection_string_here
JWT_SECRET=your_jwt_secret_key_here
PORT=5000

# Email Configuration (SendGrid)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key_here
SENDGRID_FROM_EMAIL=your_email@yourdomain.com

# SharePoint Configuration (Optional - for PDF storage)
AZURE_CLIENT_ID=your_azure_client_id_here
AZURE_CLIENT_SECRET=your_azure_client_secret_here
AZURE_TENANT_ID=your_azure_tenant_id_here
SHAREPOINT_SITE_ID=your_sharepoint_site_id_here
SHAREPOINT_DRIVE_ID=your_sharepoint_drive_id_here

# Environment
NODE_ENV=development
```

### 2. Required Configuration Steps

#### MongoDB Setup:
1. Create a MongoDB Atlas account or use local MongoDB
2. Get connection string and replace `MONGO_URI`
3. Ensure database user has read/write permissions

#### SendGrid Email Setup:
1. Create SendGrid account
2. Generate API key
3. Replace `SMTP_PASS` with your SendGrid API key
4. Set `SENDGRID_FROM_EMAIL` to your verified sender email

#### SharePoint Setup (Optional):
1. Register app in Azure AD
2. Get Client ID, Client Secret, and Tenant ID
3. Configure SharePoint site permissions
4. Get SharePoint Site ID and Drive ID

## Frontend Configuration

### 1. Create `.env` file in `/frontend` directory

```bash
# API Configuration
REACT_APP_API_BASE_URL=http://localhost:5000

# For production deployment:
# REACT_APP_API_BASE_URL=https://your-backend-url.com
```

### 2. Environment-Specific Setup

#### Development:
```bash
REACT_APP_API_BASE_URL=http://localhost:5000
```

#### Production:
```bash
REACT_APP_API_BASE_URL=https://your-deployed-backend-url.com
```

## Security Best Practices

### 1. Environment Variables
- ✅ Use `.env` files for sensitive configuration
- ✅ Add `.env` to `.gitignore`
- ✅ Use different values for development/production
- ❌ Never hardcode credentials in source code
- ❌ Never commit `.env` files to version control

### 2. JWT Secrets
- Use strong, randomly generated secrets
- Minimum 32 characters long
- Use different secrets for each environment

### 3. API Keys
- Rotate keys regularly
- Use least privilege principle
- Monitor usage and set up alerts

## Deployment Configuration

### Backend Deployment (GCP/Heroku/AWS):
1. Set environment variables in deployment platform
2. Don't use `.env` files in production
3. Use platform-specific secret management

### Frontend Deployment:
1. Build with production environment variables
2. Ensure `REACT_APP_API_BASE_URL` points to production backend
3. Use HTTPS in production

## Troubleshooting

### Common Issues:

1. **500 Server Error**: Check MongoDB connection string
2. **Email not sending**: Verify SendGrid API key and from email
3. **401 Authentication Error**: Check JWT secret configuration
4. **SharePoint upload fails**: Verify Azure AD app permissions

### Environment Variable Loading:
- Backend uses `dotenv` package
- Frontend requires `REACT_APP_` prefix
- Restart servers after changing `.env` files

## Example Configuration Values

### Development MongoDB (Local):
```bash
MONGO_URI=mongodb://localhost:27017/asset-management
```

### Production MongoDB (Atlas):
```bash
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/database?retryWrites=true&w=majority
```

### JWT Secret Generation:
```bash
# Generate random JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Contact Information

For configuration help or questions:
- IT Department: it@cirruslabs.io
- Technical Support: support@cirruslabs.io

---

**Remember: Keep your credentials secure and never share them publicly!**