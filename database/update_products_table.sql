-- Add IsFeatured and IsBestseller columns to Products table if they don't exist

-- Check and add IsFeatured column
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_NAME = 'Products' AND COLUMN_NAME = 'IsFeatured')
BEGIN
    ALTER TABLE Products
    ADD IsFeatured BIT DEFAULT 0;
END

-- Check and add IsBestseller column  
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_NAME = 'Products' AND COLUMN_NAME = 'IsBestseller')
BEGIN
    ALTER TABLE Products
    ADD IsBestseller BIT DEFAULT 0;
END

-- Check and add Sold column if not exists
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_NAME = 'Products' AND COLUMN_NAME = 'Sold')
BEGIN
    ALTER TABLE Products
    ADD Sold INT DEFAULT 0;
END

PRINT 'Database updated successfully!';
