/* flashcard_academy db schema */

-- USER ROLES
CREATE TABLE user_roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(20) UNIQUE NOT NULL -- 'member' (id: 1) or 'admin' (id: 2)
);

-- Insert default roles
INSERT INTO user_roles (id, name) VALUES 
(1, 'member'),
(2, 'admin');

-- USERS
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    role_id INT NOT NULL DEFAULT 1, -- Default to member role
    image VARCHAR(255),
    bio TEXT,
    google_id VARCHAR(255) UNIQUE,
    auth_provider VARCHAR(50) DEFAULT 'local',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_google_id (google_id),
    INDEX idx_email (email),
    FOREIGN KEY (role_id) REFERENCES user_roles(id)
);

-- OPENAI REQUESTS
CREATE TABLE openai_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    prompt_tokens INT NOT NULL,
    completion_tokens INT NOT NULL,
    total_tokens INT NOT NULL,
    model VARCHAR(50) NOT NULL DEFAULT 'gpt-4',
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    status ENUM('pending', 'success', 'failed', 'rate_limited', 'timeout') NOT NULL DEFAULT 'pending',
    error_message TEXT,
    duration_ms INT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- CATEGORIES
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

-- SETS
CREATE TABLE sets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    educator_id INT NOT NULL,
    price DECIMAL(10,2) DEFAULT 0,
    is_subscriber_only TINYINT(1) DEFAULT 0,
    thumbnail VARCHAR(255),
    category_id INT NOT NULL,
    featured TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    hidden TINYINT(1) DEFAULT 0,
    download_url VARCHAR(255),
    FOREIGN KEY (educator_id) REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- CARDS
CREATE TABLE cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    set_id INT NOT NULL,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    hint TEXT,
    layout_front VARCHAR(32) DEFAULT 'default',
    layout_back VARCHAR(32) DEFAULT 'default',
    has_audio TINYINT(1) DEFAULT 0,
    audio_url VARCHAR(255),
    front_image VARCHAR(255),
    back_image VARCHAR(255),
    FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE
);

-- USER LIKES
CREATE TABLE user_likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    set_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, set_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE
);

-- PURCHASES (SALES)
CREATE TABLE purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    set_id INT NOT NULL,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE
);

-- SUBSCRIPTIONS
CREATE TABLE subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    educator_id INT NOT NULL,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (educator_id) REFERENCES users(id) ON DELETE CASCADE
);

-- TRANSACTIONS
CREATE TABLE transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stripe_session_id VARCHAR(191) NOT NULL UNIQUE,
  stripe_payment_intent_id VARCHAR(191),
  user_id INT NOT NULL,
  set_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'usd',
  status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
  error_message TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (set_id) REFERENCES sets(id)
);

-- TAGS (optional, for set tagging)
CREATE TABLE tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);
CREATE TABLE set_tags (
    set_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (set_id, tag_id),
    FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- VIEW HISTORY
CREATE TABLE view_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    set_id INT NOT NULL,
    num_cards_viewed INT NOT NULL,
    completed TINYINT(1) DEFAULT 0,
    completed_at TIMESTAMP,
    started_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_cards_set_id ON cards(set_id);
CREATE INDEX idx_likes_user_id ON user_likes(user_id);
CREATE INDEX idx_likes_set_id ON user_likes(set_id);

-- Generation Sessions
CREATE TABLE IF NOT EXISTS generation_sessions (
    id VARCHAR(36) PRIMARY KEY,
    user_id INT NOT NULL,
    openai_request_id VARCHAR(191) NOT NULL DEFAULT 'pending',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status ENUM('preparing', 'generating', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'preparing',
    cards_generated INT NOT NULL DEFAULT 0,
    total_cards INT NOT NULL DEFAULT 10,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    error_message TEXT,
    current_operation TEXT
);

-- Newsletter Subscribers
CREATE TABLE newsletter_subscribers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(191) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- STOCK IMAGES
CREATE TABLE IF NOT EXISTS `stock_image` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cloudinary_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_prompt` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `filename` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `public_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `upload_time` int DEFAULT NULL,
  `file_size` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_session_id` (`session_id`),
  KEY `idx_created_at` (`created_at`)
);

-- CLOUDINARY ASSETS
CREATE TABLE IF NOT EXISTS `cloudinary` (
  `id` int NOT NULL AUTO_INCREMENT,
  `public_id` varchar(191) NOT NULL,
  `secure_url` text NOT NULL,
  `resource_type` varchar(50) NOT NULL DEFAULT 'image',
  `format` varchar(20) DEFAULT NULL,
  `width` int DEFAULT NULL,
  `height` int DEFAULT NULL,
  `bytes` int DEFAULT NULL,
  `folder` varchar(100) DEFAULT NULL,
  `original_filename` varchar(191) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_cloudinary_public_id` (`public_id`),
  KEY `idx_cloudinary_folder` (`folder`),
  KEY `idx_cloudinary_resource_type` (`resource_type`)
);
