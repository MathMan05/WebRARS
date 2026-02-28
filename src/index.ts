import http from "http";
import fs from "node:fs/promises";
import path from "node:path";

import {fileURLToPath} from "node:url";
import process from "node:process";

const devmode = (process.env.NODE_ENV || "development") === "development";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
type dirtype = Map<string, dirtype | string>;
async function getDirectories(path: string): Promise<dirtype> {
	return new Map(
		await Promise.all(
			(await fs.readdir(path)).map(async function (file): Promise<[string, string | dirtype]> {
				if ((await fs.stat(path + "/" + file)).isDirectory()) {
					return [file, await getDirectories(path + "/" + file)];
				} else {
					return [file, file];
				}
			}),
		),
	);
}

let dirs: dirtype | undefined = undefined;
async function combinePath(path: string, tryAgain = true, reqpath: string): Promise<string> {
	if (!dirs) {
		dirs = await getDirectories(__dirname);
	}
	const pathDir = path
		.split("/")
		.reverse()
		.filter((_) => _ !== "");
	function find(arr: string[], search: dirtype | string | undefined): boolean {
		if (search == undefined) return false;
		if (arr.length === 0) {
			return typeof search == "string";
		}
		if (typeof search == "string") {
			return false;
		}
		const thing = arr.pop() as string;
		return find(arr, search.get(thing));
	}
	if (find(pathDir, dirs)) {
		return __dirname + path;
	} else if (reqpath.startsWith("/channels")) {
		return __dirname + "/webpage/app.html";
	} else {
		if (!path.includes(".")) {
			const str = await combinePath(path + ".html", false, reqpath);
			if (str !== __dirname + "/webpage/404.html") {
				return str;
			}
		}
		if (devmode && tryAgain) {
			dirs = await getDirectories(__dirname);
			return combinePath(path, false, reqpath);
		}
		return __dirname + "/webpage/404.html";
	}
}

function guessMime(str: string) {
	const ext = str.split(".").at(-1);
	switch (ext) {
		case "js":
		case "cjs":
			return "text/javascript";
		case "html":
			return "text/html";
		case "css":
			return "text/css";
		case "svg":
			return "image/svg+xml";
		case "ico":
			return "image/x-icon";
		case "png":
		case "jpeg":
		case "webp":
			return "image/" + ext;
		default:
			return "text/plain";
	}
}
const app = http.createServer(async (req, res) => {
	const url = new URL(req.url as string, "http://localhost");
	const pathstr = url.pathname;

	async function sendFile(file: string) {
		try {
			const f = await fs.readFile(file);
			res.writeHead(200, {"Content-Type": guessMime(file)});
			res.write(f);
			res.end();
		} catch {
			res.writeHead(404, {"Content-Type": "text/html"});
			res.write("Uh, this ain't supposed to happen");
			res.end();
		}
	}
	if (pathstr === "/") {
		sendFile(path.join(__dirname, "webpage", "index.html"));
		return;
	}

	if (pathstr.startsWith("/invite/")) {
		sendFile(path.join(__dirname, "webpage", "invite.html"));
		return;
	}
	if (pathstr.startsWith("/template/")) {
		sendFile(path.join(__dirname, "webpage", "template.html"));
		return;
	}
	const filePath = await combinePath("/webpage/" + pathstr, true, pathstr);
	sendFile(filePath);
});

const PORT = process.env.PORT || Number(process.argv[2]) || 8080;
app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
