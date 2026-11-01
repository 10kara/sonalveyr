-- Архив Солана Вейра — схема MySQL / MariaDB.
-- API выполняет этот файл сам при каждом запуске (всё через IF NOT EXISTS),
-- поэтому запускать его вручную не обязательно. Можно и вручную —
-- например, в phpMyAdmin базы, созданной во вкладке Databases в Pterodactyl.

CREATE TABLE IF NOT EXISTS `characters` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(160) NOT NULL DEFAULT '',
  `name_latin` VARCHAR(160) NOT NULL DEFAULT '',
  `former_name` VARCHAR(160) NOT NULL DEFAULT '',
  `species` VARCHAR(120) NOT NULL DEFAULT '',
  `gender` VARCHAR(60) NOT NULL DEFAULT '',
  `age` SMALLINT NULL,
  `homeworld` VARCHAR(120) NOT NULL DEFAULT '',
  `affiliation` VARCHAR(160) NOT NULL DEFAULT '',
  `rank_title` VARCHAR(160) NOT NULL DEFAULT '',
  `specialization` VARCHAR(160) NOT NULL DEFAULT '',
  `alignment` VARCHAR(160) NOT NULL DEFAULT '',
  `eye_color` VARCHAR(120) NOT NULL DEFAULT '',
  `saber_color` VARCHAR(120) NOT NULL DEFAULT '',
  `callsign` VARCHAR(120) NOT NULL DEFAULT '',
  `epigraph` VARCHAR(500) NOT NULL DEFAULT '',
  `summary` TEXT NULL,
  `appearance` TEXT NULL,
  `personality` TEXT NULL,
  `flaw` TEXT NULL,
  `combat_style` TEXT NULL,
  `traits` TEXT NULL,
  `forms` TEXT NULL,
  `saber` TEXT NULL,
  `details` TEXT NULL,
  `image_url` VARCHAR(512) NOT NULL DEFAULT '',
  `holo_effect` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chapters` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `chapter_number` INT NULL,
  `title` VARCHAR(255) NOT NULL DEFAULT '',
  `content` MEDIUMTEXT NULL,
  `cover_image` VARCHAR(512) NOT NULL DEFAULT '',
  `published` TINYINT(1) NOT NULL DEFAULT 1,
  `holo_effect` TINYINT(1) NOT NULL DEFAULT 1,
  KEY `chapters_number_idx` (`chapter_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `relationships` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `name` VARCHAR(160) NOT NULL DEFAULT '',
  `role` VARCHAR(255) NOT NULL DEFAULT '',
  `relation` VARCHAR(512) NOT NULL DEFAULT '',
  `quote` TEXT NULL,
  `image_url` VARCHAR(512) NOT NULL DEFAULT '',
  `holo_effect` TINYINT(1) NOT NULL DEFAULT 1,
  `pos_x` DOUBLE NULL,
  `pos_y` DOUBLE NULL,
  `group_tag` VARCHAR(32) NOT NULL DEFAULT 'ally'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gallery` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `title` VARCHAR(255) NOT NULL DEFAULT '',
  `caption` VARCHAR(512) NOT NULL DEFAULT '',
  `image_url` VARCHAR(512) NOT NULL DEFAULT '',
  `category` VARCHAR(32) NOT NULL DEFAULT 'archive',
  `sort_order` INT NOT NULL DEFAULT 0,
  `holo_effect` TINYINT(1) NOT NULL DEFAULT 1,
  KEY `gallery_sort_idx` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Связи между персонажами. Хранится одна запись на пару (from_id < to_id).
-- Связь главного героя со всеми узлами рисуется автоматически.
CREATE TABLE IF NOT EXISTS `character_links` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `from_id` INT UNSIGNED NOT NULL,
  `to_id` INT UNSIGNED NOT NULL,
  `link_type` VARCHAR(64) NOT NULL DEFAULT 'connection',
  `note` VARCHAR(255) NOT NULL DEFAULT '',
  UNIQUE KEY `character_links_pair` (`from_id`, `to_id`),
  KEY `character_links_to_idx` (`to_id`),
  CONSTRAINT `character_links_from_fk` FOREIGN KEY (`from_id`) REFERENCES `relationships` (`id`) ON DELETE CASCADE,
  CONSTRAINT `character_links_to_fk` FOREIGN KEY (`to_id`) REFERENCES `relationships` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
