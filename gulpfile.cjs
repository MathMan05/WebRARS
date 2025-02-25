const gulp = require("gulp");
const rimraf = require("rimraf");
const plumber = require("gulp-plumber");
const fs = require("fs");
const {swcDir} = require("@swc/cli");
const {rspack} = require("@rspack/core");

gulp.task(
	"watch",
	function () {
		gulp.watch("./src", gulp.series("default"));
		gulp.watch("./translations", gulp.series("default"));
	},
	{debounceDelay: 10},
);

// Clean task to delete the dist directory
gulp.task("clean", (cb) => {
	return rimraf.rimraf("dist").then(cb());
});

/*

 */
// Task to compile TypeScript files using SWC
gulp.task("scripts", async () => {
	const entryPoints = ["/index.ts", "/webpage/index.ts", "/webpage/utils/dirrWorker.ts"];
	return await new Promise((ret) => {
		//*
		swcDir({
			cliOptions: {
				outDir: "./dist",
				watch: false,
				filenames: ["./src"],
				extensions: [".ts"],
				stripLeadingPaths: true,
				jsc: {
					transform: {
						optimizer: {
							globals: {
								vars: {
									__DEBUG__: "true",
								},
							},
						},
					},
				},
			},
			callbacks: {
				onSuccess: (e) => {
					ret();
					console.log(e);
				},
				onFail: (e) => {
					for ([, reason] of e.reasons) {
						console.log(reason);
					}
					ret();
				},
				onWatchReady: () => {},
			},
		});
		//*/
		/*
		const mapped = entryPoints.map((path) => {
			return {
				entry: "./src" + path,
				output: {filename: "./dist" + path.split(".ts")[0] + ".js"},
			};
		});
		console.log(mapped);
		const temp = rspack(mapped);
		temp.run();
		ret();
		//*/
	});
});

// Task to copy HTML files
gulp.task("copy-html", () => {
	return gulp
		.src("src/**/*.html")
		.pipe(plumber()) // Prevent pipe breaking caused by errors
		.pipe(gulp.dest("dist"));
});
gulp.task("copy-translations", () => {
	let langs = fs.readdirSync("translations");
	langs = langs.filter((e) => e !== "qqq.json");
	const langobj = {};
	for (const lang of langs) {
		const json = JSON.parse(fs.readFileSync("translations/" + lang).toString());
		langobj[lang] = json.readableName;
	}
	if (!fs.existsSync("dist/webpage/translations")) fs.mkdirSync("dist/webpage/translations");
	fs.writeFileSync(
		"dist/webpage/translations/langs.js",
		`const langs=${JSON.stringify(langobj)};export{langs}`,
	);
	return gulp
		.src("translations/*.json")
		.pipe(plumber()) // Prevent pipe breaking caused by errors
		.pipe(gulp.dest("dist/webpage/translations"));
});
// Task to copy other static assets (e.g., CSS, images)
gulp.task("copy-assets", () => {
	return gulp
		.src(
			[
				"src/**/*.css",
				"src/**/*.bin",
				"src/**/*.ico",
				"src/**/*.json",
				"src/**/*.js",
				"src/**/*.png",
				"src/**/*.jpg",
				"src/**/*.jpeg",
				"src/**/*.webp",
				"src/**/*.gif",
				"src/**/*.svg",
				"src/**/*.jasf",
				"src/**/*.txt",
			],
			{encoding: false},
		)
		.pipe(plumber()) // Prevent pipe breaking caused by errors
		.pipe(gulp.dest("dist"));
});

// Default task to run all tasks
gulp.task(
	"default",
	gulp.series("clean", "scripts", gulp.parallel("copy-html", "copy-assets"), "copy-translations"),
);
