setTheme();
export function setTheme() {
	let name = localStorage.getItem("theme");
	if (!name) {
		localStorage.setItem("theme", "Dark");
		name = "Dark";
	}
	document.body.className = name + "-theme";
}

class Directory {
	static home = this.createHome();
	handle: FileSystemDirectoryHandle;
	writeWorker?: Worker;
	private constructor(handle: FileSystemDirectoryHandle) {
		this.handle = handle;
	}
	static async createHome(): Promise<Directory> {
		const home = new Directory(await navigator.storage.getDirectory());
		//TODO make this if false inform the user
		navigator.storage.persist().then(console.log);
		return home;
	}
	async *getAllInDir() {
		for await (const [name, handle] of this.handle.entries()) {
			if (handle instanceof FileSystemDirectoryHandle) {
				yield [name, new Directory(handle)] as [string, Directory];
			} else if (handle instanceof FileSystemFileHandle) {
				yield [name, await handle.getFile()] as [string, File];
			} else {
				console.log(handle, "oops :3");
			}
		}
		console.log("done");
	}
	async getRawFileHandler(name: string) {
		return await this.handle.getFileHandle(name);
	}
	async getRawFile(name: string) {
		try {
			return await (await this.handle.getFileHandle(name)).getFile();
		} catch {
			return undefined;
		}
	}
	async getString(name: string): Promise<string | undefined> {
		try {
			return await (await this.getRawFile(name))!.text();
		} catch {
			return undefined;
		}
	}
	initWorker() {
		if (this.writeWorker) return this.writeWorker;
		this.writeWorker = new Worker("/utils/dirrWorker.js");
		this.writeWorker.onmessage = (event) => {
			const res = this.wMap.get(event.data[0]);
			this.wMap.delete(event.data[0]);
			if (!res) throw new Error("Res is not defined here somehow");
			res(event.data[1]);
		};
		return this.writeWorker;
	}
	wMap = new Map<number, (input: boolean) => void>();
	async setStringWorker(name: FileSystemFileHandle, value: ArrayBuffer) {
		const worker = this.initWorker();
		const random = Math.random();
		worker.postMessage([name, value, random]);
		return new Promise<boolean>((res) => {
			this.wMap.set(random, res);
		});
	}
	async setString(name: string, value: string): Promise<boolean> {
		const file = await this.handle.getFileHandle(name, {create: true});
		const contents = new TextEncoder().encode(value);

		if (file.createWritable as unknown) {
			const stream = await file.createWritable({keepExistingData: false});
			await stream.write(contents);
			await stream.close();
			return true;
		} else {
			//Curse you webkit!
			return await this.setStringWorker(file, contents);
		}
	}
	async getDir(name: string) {
		return new Directory(await this.handle.getDirectoryHandle(name, {create: true}));
	}
}

export {Directory};
