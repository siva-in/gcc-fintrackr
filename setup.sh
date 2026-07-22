#!/bin/bash
set -e

echo "=== FinTrackr Setup ==="

# Backend setup
echo ""
echo "--- Backend Setup ---"
cd backend
npm install
npx prisma generate
npx prisma db push
node src/utils/seed.js
echo "Backend setup complete!"
cd ..

# Frontend setup
echo ""
echo "--- Frontend Setup ---"
cd frontend
npm install
echo "Frontend setup complete!"
cd ..

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To start the application:"
echo "  Backend:  cd backend && npm run dev"
echo "  Frontend: cd frontend && npm run dev"
echo ""
echo "Make sure PostgreSQL is running and update backend/.env with your DB credentials."
