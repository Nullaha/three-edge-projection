import {
	Box3,
	WebGLRenderer,
	Scene,
	DirectionalLight,
	AmbientLight,
	Group,
	MeshStandardMaterial,
	MeshBasicMaterial,
	PerspectiveCamera,
	Mesh,
	TorusKnotGeometry,
	DoubleSide,
	LineSegments,
	LineBasicMaterial,
} from 'three';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OUTPUT_BOTH, SilhouetteGenerator } from './generator/index.js';
import { SilhouetteGeneratorWorker } from '../src/worker/SilhouetteGeneratorWorker.js';

const sizes = {
	width: 800,
	height: 600,
}
const params = {
	displaySilhouette: true,
	displayWireframe: false,
	displayOutline: false,
	displayModel: true,
	useWorker: false,
	rotate: () => {
		debugger

		group.quaternion.random(); // 随机旋转
		group.position.set( 0, 0, 0 );
		group.updateMatrixWorld( true );

		const box = new Box3(); // AABB
		box.setFromObject( model, true );
		box.getCenter( group.position ).multiplyScalar( - 1 );
		group.position.y = Math.max( 0, - box.min.y ) + 1;

	},
	regenerate: () => {

		task = updateEdges();

	},
};

let renderer, camera, scene, gui, controls;
let model, projection, projectionWireframe, group, edges;
let outputContainer;
let worker;
let task = null;

init();

async function init() {
	debugger

	outputContainer = document.querySelector( '#output' );

	const bgColor = 0xeeeeee;

	// renderer setup
	renderer = new WebGLRenderer( { antialias: true } );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setClearColor( bgColor, 1 );
	document.body.appendChild( renderer.domElement );

	// scene setup
	scene = new Scene();

	// lights
	// const light = new DirectionalLight( 0xffffff, 3.5 );
	// light.position.set( 1, 2, 3 );
	// scene.add( light );

	const ambientLight = new AmbientLight( 0xb0bec5, 0.5 );
	scene.add( ambientLight );

	// load model
	group = new Group();
	group.position.y = 2;
	scene.add( group );

	model = new Mesh( new TorusKnotGeometry( 1, 0.4, 120, 30 ), new MeshStandardMaterial( {
		polygonOffset: true,
		polygonOffsetFactor: 1,
		polygonOffsetUnits: 1,
	} ) );
	// model.rotation.set( Math.PI / 4, 0, Math.PI / 8 );
	group.add( model );

	// create projection display mesh
	projection = new Mesh( undefined, new MeshBasicMaterial( {
		color: 0xf06292,
		side: DoubleSide,
		polygonOffset: true, // 启用多边形偏移，可以防止 Z-fighting
		polygonOffsetFactor: 1, //控制多边形偏移的程度。
		polygonOffsetUnits: 1,  //控制多边形偏移的程度。
	} ) );
	projection.position.y = - 2;
	scene.add( projection );

	edges = new LineSegments( undefined, new LineBasicMaterial( { color: 0 } ) ); //线段    color: 0 实际上是一个十六进制颜色值的简写形式，它等同于 color: 0x000000，表示黑色。
	edges.position.y = - 2;
	scene.add( edges );

	projectionWireframe = new Mesh( undefined, new MeshBasicMaterial( { color: 0xc2185b, wireframe: true } ) );
	projectionWireframe.position.y = - 2;
	scene.add( projectionWireframe );

	// camera setup
	camera = new PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.01, 50 );
	camera.position.setScalar( 4.5 );
	camera.updateProjectionMatrix();

	// controls
	controls = new OrbitControls( camera, renderer.domElement );

	gui = new GUI();
	gui.add( params, 'displayModel' );
	gui.add( params, 'displaySilhouette' );
	gui.add( params, 'displayOutline' );
	gui.add( params, 'displayWireframe' );
	gui.add( params, 'useWorker' );
	gui.add( params, 'rotate' );
	gui.add( params, 'regenerate' );

	worker = new SilhouetteGeneratorWorker();

	task = updateEdges();

	render();

	window.addEventListener( 'resize', function () {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		renderer.setSize( window.innerWidth, window.innerHeight );

	}, false );

}

function* updateEdges( runTime = 30 ) {

	outputContainer.innerText = 'processing: --';

	// transform and merge geometries to project into a single model
	let timeStart = window.performance.now(); //返回一个表示自某个固定时间点（通常是页面加载或某个显著的起始时间）以来的毫秒数。
	const geometries = [];
	model.updateWorldMatrix( true, true );  // object.updateWorldMatrix(updateParents, updateChildren);
	model.traverse( c => {

		if ( c.geometry ) {

			const clone = c.geometry.clone(); // geometry
			clone.applyMatrix4( c.matrixWorld ); // 将geometry的顶点从局部坐标转为世界坐标。
			for ( const key in clone.attributes ) { 
				// 删除所有非位置属性
				if ( key !== 'position' ) {

					clone.deleteAttribute( key );

				}

			}

			geometries.push( clone );

		}
	} );
	const mergedGeometry = mergeGeometries( geometries, false );
	const mergeTime = window.performance.now() - timeStart;

	yield;

	// generate the candidate edges
	timeStart = window.performance.now();

	let result = null;
	if ( ! params.useWorker ) {

		const generator = new SilhouetteGenerator();
		generator.iterationTime = runTime;
		generator.output = OUTPUT_BOTH;
		const task = generator.generate( mergedGeometry, {

			onProgress: ( p, info ) => {

				outputContainer.innerText = `processing: ${ parseFloat( ( p * 100 ).toFixed( 2 ) ) }%`;

				const result = info.getGeometry();
				projection.geometry.dispose();
				projection.geometry = result[ 0 ];
				projectionWireframe.geometry = result[ 0 ];

				edges.geometry.dispose();
				edges.geometry = result[ 1 ];

				if ( params.displaySilhouette || params.displayWireframe || params.displayOutline ) {

					projection.geometry.dispose();
					projection.geometry = result[ 0 ];
					projectionWireframe.geometry = result[ 0 ];

					edges.geometry.dispose();
					edges.geometry = result[ 1 ];

				}

			},

		} );

		let res = task.next();
		while ( ! res.done ) {

			res = task.next();
			yield;

		}

		result = res.value;

	} else {

		worker
			.generate( mergedGeometry, {
				output: OUTPUT_BOTH,
				onProgress: p => {

					outputContainer.innerText = `processing: ${ parseFloat( ( p * 100 ).toFixed( 2 ) ) }%`;

				},
			} )
			.then( res => {

				result = res;

			} );

		while ( result === null ) {

			yield;

		}

	}

	const trimTime = window.performance.now() - timeStart;
	projection.geometry.dispose();
	projection.geometry = result[ 0 ];
	projectionWireframe.geometry = result[ 0 ];

	edges.geometry.dispose();
	edges.geometry = result[ 1 ];

	outputContainer.innerText =
		`merge geometry  : ${ mergeTime.toFixed( 2 ) }ms\n` +
		`edge trimming   : ${ trimTime.toFixed( 2 ) }ms\n` +
		`triangles       : ${ projection.geometry.index.count / 3 } tris`;

}

function render() {

	requestAnimationFrame( render );

	if ( task ) {

		const res = task.next();
		if ( res.done ) {

			task = null;

		}

	}

	model.visible = params.displayModel;
	projection.visible = params.displaySilhouette;
	projectionWireframe.visible = params.displayWireframe;
	edges.visible = params.displayOutline;
	renderer.render( scene, camera );

}
