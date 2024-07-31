## 思路  

### 它的算法思路是： 

flatten the triangle  

xyz三维的triangle变成xz平面上的riangle。  


### 它的代码思路：（迭代器版）  

创建：
model = new Mesh()  
model.position.y = 2
projection = new Mesh(undefined,new MeshBasicMaterial())  
projection.position.y = -2
edges= new LineSegments()
projectionWireframe = new Mesh( undefined, new MeshBasicMaterial( { color: 0xc2185b, wireframe: true } ) );  
projectionWireframe.position.y = - 2;  


let task = updateEdges()
每一帧都会调用task.next(),直到返回值的done为true。  

task里面： 
  拿model的geometries  
  计算mergedGeometry  
  yield

  generator = new SilhouetteGenerator()  
  const task = generator.generate(mergedGeometry,{})  
  控制 task2, 通过while一直循环task2.next()。

  task2里面：
    拿geometry的索引和位置属性,得一共有多少个triangle。   
    遍历，拿到每个triangle的三个顶点。  
    3维变2维  
    计算重心，扩张一下三个顶点，保证三角形都是叠在一起的  
    由顶点生成 path  
    合并paths  
    判断是否超时，触发回调函数，返回进度  
    paths -> geometry  


### 它的代码思路：（worker版） 

1. 主线程监听onMessage接收worker传来的消息：

```js
worker.onmessage = e => {

  if(error){
    // error
  }
  else if (result){
  
    // result:

  }
  else if (progress){
    
    // progress:
  }
}

```

2. 主线程调用postMesonPsage给worker发送消息：

```js
worker.postMessage( {
  index,
  position,
  options: {
    ...options,
    onProgress: null,
    includedProgressCallback: Boolean( options.onProgress ),
  },
}, transfer );
```

3. worker监听onMessage接收主线程传来的消息：
```js
onmessage = function ({data}){

  // (和不使用worker步骤差不多)

  // 1.用index和position创建了原来的geometry在worker中使用

  // 2.调用new SilhouetteGenerator()创建generator  

  // 拿到 generator的结果result: geometry

  // 组装indexArr 和posArr

  // 给主线发送消息 （也用了transfer）

}
```

//这里主线为什么不直接传geometry过来，而是传了index和position然后在worker里创建了个geometry来用？ 


4. worker调用postMessage给主线程发送消息：









 

### 问题?    

1. const clone = mesh.geomery.clone() ?  

clone只是一个geometry  

2. clone.applyMatrix4(mesh.matrixWorld)?  

作用是将mesh的世界矩阵应用到clone上。

目的是将clone的顶点从局部坐标转为世界坐标咯。

改变的是clone.attribute.position.

3. 计算重心  
```js
import {Vector3,Triangle  } from 'three';

const _center = /* @__PURE__ */ new Vector3();

const a = new Vector3(1.108752965927124,0,-0.07575390487909317)

const b = new Vector3(1.1001445055007935,0,-0.02606511302292347)

const c = new Vector3(1.1345930099487305,0,-0.14679700136184692)

_center
  .copy( a ) // _center复制了顶点a
  .add( b )  // _center加b
  .add( c )
  .multiplyScalar( 1 / 3 );

console.log(_center); // Vector3 { x: 1.1144968271255493, y: 0, z: -0.08287200642128785}

```

4. vec3.subVectors(a,_center) ??  

>.subVectors ( a : Vector3, b : Vector3 ) : this
Sets this vector to a - b.  

👆得到的是 b->a向量。   


5. a.addScaledVector( _vec, extendMultiplier );??  


6. 大数据量的循环，返回进度值。  

```js
function* generate(count,options = {} ) {
  console.log('generate方法开始-----------')
  const {onProgress} = options

  // let time = window.performance.now()
  let time = Date.now()

  for (let i = 0; i < count; i++) {

    // ...
    // const delta = window.performance.now() - time;
    const delta = Date.now() - time;
    if (delta > 2){

      if(onProgress){
        const progress = i/count
        onProgress(`${progress}:${i}/${count}`)
      }

      yield;
      // time = window.performance.now();
      time = Date.now()
    }
  }

  console.log('generate方法结束-----------')
  return 'xixi'
}

/**
 * 使用
 */
const task = generate(10000000,{
  onProgress: (progress) => {
    console.log('进度',progress)
  }
})
let res = task.next()
while(!res.done){
  res = task.next()
}

const result = res.value


// generate方法开始-----------
// 进度 0.0012927:12927/10000000
// 进度 0.0025799:25799/10000000
// 进度 0.0056418:56418/10000000
// 进度 0.0089603:89603/10000000
// 进度 0.0113967:113967/10000000
// 进度 0.0145132:145132/10000000
// 进度 0.0181371:181371/10000000
// 进度 0.0216073:216073/10000000
// 进度 0.0254954:254954/10000000
// 进度 0.0291127:291127/10000000
// ... 
```


7. Vector2 孔洞 ？  

vector2s 数组中的路径根据其方向（顺时针或逆时针）分成轮廓形状和孔洞形状。

8. new ShapeGeometry(shapes) ?? 
```js
import { ShapeGeometry, Shape, Vector2 } from 'three';

// 逆时针的是孔洞
const holes = [new Shape()] // 顺时针
const shape = new Shape() // 逆时针
shape.holes = holes
const shapes = [shape]

const geom = new ShapeGeometry(shapes)
```


9. 	const result = new ShapeGeometry( solidShapes ).rotateX( Math.PI / 2 );
	result.index.array.reverse();  ??  

rotateX我能理解，要面向屏幕嘛。   

reverse() 我不理解，为什么要把索引数组反转？？？  

> transform your points into the XY plane first before generating your shapes.  

[2D object in 3D space (by vertices)](https://discourse.threejs.org/t/2d-object-in-3d-space-by-vertices/2795/34?page=2)  


大概是因为绕x轴旋转后，正面朝下了，也就是法线指向👇。所以要reverse索引。（可以用右手定则看一下） 

1 一开始逆时针旋转，面向屏幕，右手定则，大拇指指向屏幕外。

2 rotateX(90°) ，右手定则知，正面 面向-y轴了。也就是法线👇。   

3 所以reverse index嘛。让法线👆。


10. rotateX(角度)，角度的正值还是负值，是怎么转的?  

右手定则。大拇指指向x轴正轴时，手指方向就是正方向咯。  


11. *updateEdges()的作用？  

这个函数用于控制 *SilhouetteGenerator.generate() 的执行。  

requestAnimationFrame() 又控制着*updateEdges的执行。  


12. worker 的创建、使用？  

创建：  

const worker = new Worker(scriptURL, options);
const worker = new Worker('./worker.js', { type: 'module' });



worker.js脚本的编写：  

监听onmessage来接收主线程的消息。  
通过postMessage发送消息给主线程。

主线程与worker.js通信：  
const worker = new Worker('./worker.js');
worker.postMessage('Hello from main thread!');

worker.onmessage = function(e) {
    console.log('Message received from worker:', e.data);
};

12. worker.postMessage(data,transfer)的参数怎么写?  

1 消息数据（必填）
2 可转移对象的列表（可选）：是个数组  

transfer有啥用？  

> gpt
>> 通过传递 ArrayBuffer 的所有权而不是深拷贝数据，postMessage 在主线程和 Worker 之间实现了高效的数据传输。这个机制尤其适用于处理大量数据的场景，比如三维几何体的顶点和索引数据传输。

如果是数据量巨大的普通数组怎么传transfer呢？ 

将普通数组转换为 TypedArray咯。  

```js
const arr = [1,2,3]
const typedArr = new Float32Array(arr)
const buffer = typedArr.buffer
```



13. BufferAttribute里的buffer和array的区别 ？  

const position = geometry.attributes.position.array;
const buffer = geometry.attributes.position.buffer;

只是顶点数据的不同表现形式。  

position.array 是一个类型化数组（通常是 Float32Array）  
position.buffer 是一个 ArrayBuffer 对象，表示类型化数组的**底层内存缓冲区**。  

（可以在需要高效传输数据的场景中使用）  
