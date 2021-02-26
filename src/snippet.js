var size = -7

var songs = [...document.querySelectorAll('table')]
    .slice(size)
    .map(table => table.rows)
    .reduce((previous, table) => [...previous, ...[...table].splice(1)], [])

JSON.stringify(
    songs
        .map(
            row => ({
                ...(row.cells[0] && { artist: row.cells[0].innerText.toLowerCase() }),

                ...(row.cells[1] && { title: row.cells[1].innerText.toLowerCase() })
            }),
        )
)