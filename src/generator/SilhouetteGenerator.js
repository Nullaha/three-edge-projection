import { Path64, Clipper, FillRule } from 'clipper2-js';
import { ShapeGeometry, Vector3, Shape, Vector2, Triangle, ShapeUtils, BufferGeometry } from 'three';
import { compressPoints } from '../utils/compressPoints.js';
import { triangleIsInsidePaths } from '../utils/triangleIsInsidePaths.js';
import { getSizeSortedTriList } from '../utils/getSizeSortedTriList.js';
import { getTriCount } from '../utils/geometryUtils.js';

const AREA_EPSILON = 1e-8; //≈0
const UP_VECTOR = /* @__PURE__ */ new Vector3( 0, 1, 0 );  // ↑
const _tri = /* @__PURE__ */ new Triangle(); // Triangle( a : Vector3, b : Vector3, c : Vector3 )
const _normal = /* @__PURE__ */ new Vector3();
const _center = /* @__PURE__ */ new Vector3();
const _vec = /* @__PURE__ */ new Vector3();

/**
 * 用于将路径数据转换为 three.js 的 ShapeGeometry 对象
 * @param {*} path  path 是一个包含路径点的数组，每个路径由多个点组成。
 * @param {*} scale 
 * @returns 
 */
function convertPathToGeometry( path, scale ) {

	// 遍历每个路径，将每个点的坐标转换为 Vector2 对象
	const vector2s = path.map( points => {
		
		return points.flatMap( v => new Vector2( v.x / scale, v.y / scale ) );

	} );

	
	const holesShapes = vector2s
		.filter( p => ShapeUtils.isClockWise( p ) )
		.map( p => new Shape( p ) );

	const solidShapes = vector2s
		.filter( p => ! ShapeUtils.isClockWise( p ) )
		.map( p => {

			const shape = new Shape( p );
			shape.holes = holesShapes;
			return shape;

		} );

	// flip the triangles so they're facing in the right direction
	const result = new ShapeGeometry( solidShapes ).rotateX( Math.PI / 2 );
	result.index.array.reverse();
	return result;

}

function convertPathToLineSegments( path, scale ) {

	const arr = [];
	path.forEach( points => {

		for ( let i = 0, l = points.length; i < l; i ++ ) {

			const i1 = ( i + 1 ) % points.length;
			const p0 = points[ i ];
			const p1 = points[ i1 ];
			arr.push(
				new Vector3( p0.x / scale, 0, p0.y / scale ),
				new Vector3( p1.x / scale, 0, p1.y / scale )
			);

		}

	} );

	const result = new BufferGeometry();
	result.setFromPoints( arr );
	return result;

}

export const OUTPUT_MESH = 0;
export const OUTPUT_LINE_SEGMENTS = 1;
export const OUTPUT_BOTH = 2;
export class SilhouetteGenerator {

	constructor() {

		this.iterationTime = 30; //每次迭代的最大时间，用于控制异步操作的分片时间。
		this.intScalar = 1e9;
		this.doubleSided = false;  //是否双面。
		this.sortTriangles = false; //是否对三角形排序。
		this.output = OUTPUT_MESH;

	}

	generateAsync( geometry, options = {} ) {

		return new Promise( ( resolve, reject ) => {

			const { signal } = options;
			const task = this.generate( geometry, options );
			run();

			function run() {

				if ( signal && signal.aborted ) {

					reject( new Error( 'SilhouetteGenerator: Process aborted via AbortSignal.' ) );
					return;

				}

				const result = task.next();
				if ( result.done ) {

					resolve( result.value );

				} else {

					requestAnimationFrame( run );

				}

			}


		} );

	}

	*generate( geometry, options = {} ) {

		const { iterationTime, intScalar, doubleSided, output, sortTriangles } = this;
		const { onProgress } = options;
		const power = Math.log10( intScalar );
		const extendMultiplier = Math.pow( 10, - ( power - 2 ) );

		// 拿geometry的索引和位置属性  
		const index = geometry.index;
		const posAttr = geometry.attributes.position;
		// 获取三角面片的数量
		const triCount = getTriCount( geometry );
		let overallPath = null;

		const triList = sortTriangles ?
			getSizeSortedTriList( geometry ) :
			new Array( triCount ).fill().map( ( v, i ) => i );

		const handle = {

			getGeometry() {

				if ( output === OUTPUT_MESH ) {

					return convertPathToGeometry( overallPath, intScalar );

				} else if ( output === OUTPUT_LINE_SEGMENTS ) {

					return convertPathToLineSegments( overallPath, intScalar );

				} else {

					return [
						convertPathToGeometry( overallPath, intScalar ),
						convertPathToLineSegments( overallPath, intScalar ),
					];

				}

			}

		};

		/**
		 * for遍历三角形顶点，里面用了yeild。
		 * 如果超过某一时间，比如30ms，就执行外面的回调(进度)。
		 * 外面会继续调.next()，继续在for里循环咯。
		 */
		let time = performance.now();
		for ( let ti = 0; ti < triCount; ti ++ ) {

			const i = triList[ ti ] * 3;
			let i0 = i + 0;
			let i1 = i + 1;
			let i2 = i + 2;
			// 如果存在索引缓冲区，获取三角面片的顶点索引
			if ( index ) {

				// i0 = index.getX( i0 );
				// i1 = index.getX( i1 );
				// i2 = index.getX( i2 );
				i0 = index.getX( i );
				i1 = index.getY( i );
				i2 = index.getZ( i );

			}

			// get the triangle
			const { a, b, c } = _tri;
			a.fromBufferAttribute( posAttr, i0 );  // .fromBufferAttribute ( attribute : BufferAttribute, index : Integer )
			b.fromBufferAttribute( posAttr, i1 );
			c.fromBufferAttribute( posAttr, i2 );
			if ( ! doubleSided ) {
				// 如果不允许双面显示，则跳过
				// 用 up 和 normal点乘来判断（想象地球，正对着我们的是法线...）
				_tri.getNormal( _normal ); // 拿三角形的normal
				if ( _normal.dot( UP_VECTOR ) < 0 ) continue;

			}

			// flatten the triangle （将三角形在 y 方向上压平。相当于将三维的几何体投影到二维平面上）
			a.y = 0;
			b.y = 0;
			c.y = 0;

			if ( _tri.getArea() < AREA_EPSILON ) continue;

			// expand the triangle by a small degree to ensure overlap
			// (微调：沿着重心和顶点的方向微调顶点。)
			_center
				.copy( a ) // _center复制了顶点a
				.add( b )  // _center加b
				.add( c )
				.multiplyScalar( 1 / 3 );
			// 👆计算重心
			// 沿着重心->顶点方向微调顶点。
			_vec.subVectors( a, _center ).normalize(); // 由重心 指向 顶点a 的单位向量。
			a.addScaledVector( _vec, extendMultiplier );

			_vec.subVectors( b, _center ).normalize();
			b.addScaledVector( _vec, extendMultiplier );

			_vec.subVectors( c, _center ).normalize();
			c.addScaledVector( _vec, extendMultiplier );

			// create the path
			const path = new Path64(); // Path64 是用来表示简单多边形的类
			path.push( Clipper.makePath( [
				a.x * intScalar, a.z * intScalar,
				b.x * intScalar, b.z * intScalar,
				c.x * intScalar, c.z * intScalar,
			] ) ); // makePath要求整数。所以intScalar将坐标变成整数咯。

			a.multiplyScalar( intScalar );
			b.multiplyScalar( intScalar );
			c.multiplyScalar( intScalar );
			// 如果triangle在路径里，则跳过
			if ( overallPath && triangleIsInsidePaths( _tri, overallPath ) ) continue;

			// perform union
			if ( overallPath === null ) {

				overallPath = path;

			} else {

				overallPath = Clipper.Union( overallPath, path, FillRule.NonZero ); //应用非零填充规则进行路径的合并。(Union 方法用于将两个路径进行并集运算，FillRule.NonZero 是一个填充规则)
				//在使用 Clipper 合并路径后，overallPath 可能包含许多顶点，这可能会导致数据量较大，影响性能和内存使用。
				overallPath.forEach( path => compressPoints( path ) ); 

			}

			// 检查迭代时间是否超过预设的时间阈值，如果超过则触发进度回调函数
			const delta = performance.now() - time;
			if ( delta > iterationTime ) {

				if ( onProgress ) {

					const progress = ti / triCount;
					// 触发进度回调，并传递处理句柄 handle
					onProgress( progress, handle );

				}

				// 暂停当前生成任务，并记录当前时间
				yield;
				time = performance.now();

			}

		}

		return handle.getGeometry();

	}

}
