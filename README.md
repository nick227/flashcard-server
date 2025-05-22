# Flashcard App Server

A Node.js server for flashcard application for learning and memorization.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL with Sequelize ORM
- **Authentication**: JWT (JSON Web Tokens)
- **API Documentation**: Swagger/OpenAPI
- **Validation**: Express Validator
- **File Upload**: Multer
- **Testing**: Jest

## Key Features

- RESTful API architecture
- JWT-based authentication
- Role-based access control
- Pagination and filtering
- File upload handling
- Error handling middleware
- Request validation
- Database migrations
- API documentation

## Project Structure

```
server/
├── config/         # Configuration files
├── controllers/    # Route controllers
├── db/            # Database models and migrations
├── middleware/    # Custom middleware
├── routes/        # API routes
├── services/      # Business logic
├── utils/         # Utility functions
└── app.js         # Application entry point
```

## Key Components

### Controllers
- `ApiController`: Base controller with common CRUD operations
- `SetsController`: Handles flashcard set operations
- `UsersController`: Manages user-related operations
- `AuthController`: Handles authentication and authorization

### Services
- `PaginationService`: Handles pagination logic
- `SetService`: Business logic for flashcard sets
- `UserService`: User-related business logic
- `AuthService`: Authentication and authorization logic

### Models
- `User`: User model with authentication
- `Set`: Flashcard set model
- `Card`: Individual flashcard model
- `Category`: Category model for organizing sets
- `UserLike`: Tracks user likes for sets
- `Purchase`: Records set purchases

## API Endpoints

### Authentication
- `POST /auth/login`: User login
- `POST /auth/register`: User registration
- `GET /auth/me`: Get current user

### Sets
- `GET /sets`: List sets with pagination
- `POST /sets`: Create new set
- `GET /sets/:id`: Get set details
- `PUT /sets/:id`: Update set
- `DELETE /sets/:id`: Delete set

### Users
- `GET /users`: List users
- `GET /users/:id`: Get user details
- `PUT /users/:id`: Update user
- `GET /users/:id/sets`: Get user's sets

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

3. Run database migrations:
```bash
npm run migrate
```

4. Start the server:
```bash
npm start
```

## Development

- Run tests: `npm test`
- Run linter: `npm run lint`
- Generate API docs: `npm run docs`

## API Documentation

API documentation is available at `/api-docs` when running the server. The documentation is generated using Swagger/OpenAPI specifications.

## Error Handling

The server implements a centralized error handling system with:
- Custom error classes
- Error logging
- Consistent error response format
- HTTP status code mapping

## Security

- JWT-based authentication
- Password hashing with bcrypt
- CORS configuration
- Rate limiting
- Input validation
- SQL injection prevention through Sequelize
- XSS protection

## Database

The application uses MySQL with Sequelize ORM, featuring:
- Migrations for database schema changes
- Model associations
- Transaction support
- Query optimization
- Connection pooling

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request


