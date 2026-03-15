from database import get_db

async def migrate():
    # Helper script to populate domain_mappings table if needed
    async with await get_db() as db:
        await db.execute("""
            INSERT OR IGNORE INTO domain_mappings (domain, label, action) VALUES
            ('github.com', 'Developer', 'label'),
            ('stripe.com', 'Receipts', 'label'),
            ('uber.com', 'Receipts', 'archive')
        """)
        await db.commit()
    print("Schema initialized and domain_mappings seeded")

if __name__ == "__main__":
    import asyncio
    asyncio.run(migrate())
