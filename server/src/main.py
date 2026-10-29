import os

import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", "3001"))
    print(f"Server listening on port {port}")
    uvicorn.run("src.app:app", host="0.0.0.0", port=port)
