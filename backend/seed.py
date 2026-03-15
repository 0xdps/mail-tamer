from dotenv import load_dotenv
load_dotenv()

from database import get_db, init_db


async def seed_domain_mappings():
    async with get_db() as db:
        await db.execute("""
            INSERT OR IGNORE INTO domain_mappings (domain, label, action) VALUES
            ('github.com', 'Developer', 'label'),
            ('stripe.com', 'Receipts', 'label'),
            ('uber.com', 'Receipts', 'archive')
        """)
        await db.commit()
    print("domain_mappings seeded")


async def sync_gmail_labels():
    """Fetch all user-created Gmail labels with message counts and upsert into gmail_labels."""
    from gmail_client import get_gmail_service

    print("Fetching labels from Gmail…")
    service = get_gmail_service()

    result = service.users().labels().list(userId="me").execute()
    all_labels = result.get("labels", [])
    user_labels = [l for l in all_labels if l.get("type") == "user"]

    print(f"Found {len(user_labels)} user labels — fetching counts…")

    rows = []
    for lbl in user_labels:
        detail = service.users().labels().get(userId="me", id=lbl["id"]).execute()
        rows.append({
            "id": detail["id"],
            "name": detail["name"],
            "messages_total": detail.get("messagesTotal", 0),
            "messages_unread": detail.get("messagesUnread", 0),
        })
        print(f"  {detail['name']}: {detail.get('messagesTotal', 0)} emails ({detail.get('messagesUnread', 0)} unread)")

    async with get_db() as db:
        for row in rows:
            await db.execute(
                """
                INSERT INTO gmail_labels (id, name, messages_total, messages_unread, synced_at)
                VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                    name             = excluded.name,
                    messages_total   = excluded.messages_total,
                    messages_unread  = excluded.messages_unread,
                    synced_at        = excluded.synced_at
                """,
                (row["id"], row["name"], row["messages_total"], row["messages_unread"]),
            )
        await db.commit()

    print(f"Synced {len(rows)} labels into gmail_labels table")
    return rows


async def migrate():
    await init_db()
    await seed_domain_mappings()
    await sync_gmail_labels()
    print("Seed complete")


if __name__ == "__main__":
    import asyncio
    asyncio.run(migrate())
