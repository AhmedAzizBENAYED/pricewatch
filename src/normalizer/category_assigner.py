from sqlalchemy import text


def assign_category(db, site_id: str, category_url: str) -> int | None:
    """Return the category id whose urls_par_site[site_id] contains the given category_url."""
    if not category_url:
        return None
    clean_url = category_url.split("?")[0]
    row = db.execute(text("""
        SELECT id FROM categories
        WHERE urls_par_site ? :site
          AND (
            CASE WHEN jsonb_typeof(urls_par_site -> :site) = 'array'
                 THEN (urls_par_site -> :site) @> jsonb_build_array(:url)
                 ELSE urls_par_site ->> :site = :url
            END
          )
        LIMIT 1
    """), {"site": site_id, "url": clean_url}).fetchone()
    return row.id if row else None
